import { Device, types } from "mediasoup-client";
import type {
  RtpCapabilities,
  TransportOptions,
  ConsumerOptions,
  ModeProfile,
  WBOp,
} from "@visio/shared";
import { Signal } from "./signal.js";

export interface RemoteStream {
  peerId: string;
  source: string; // "cam" | "screen"
  /** Tile key suffix: "cam" or "screen:<producerId>". */
  key: string;
  kind: "audio" | "video";
  stream: MediaStream;
}

interface ConsumerEntry {
  consumer: types.Consumer;
  peerId: string;
  source: string;
  producerId: string;
}

interface ScreenShare {
  producer: types.Producer;
  stream: MediaStream;
}

export type AppData = string | ArrayBuffer;

export class RoomClient {
  readonly signal: Signal;
  private device = new Device();
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;
  private camProducer: types.Producer | null = null;
  private micProducer: types.Producer | null = null;
  private screens = new Map<string, ScreenShare>();
  private consumers = new Map<string, ConsumerEntry>(); // key: producerId
  private appDp: types.DataProducer | null = null;
  localStream: MediaStream | null = null;
  /** Set once join() succeeds. */
  peerId = "";
  /** Our public IP as seen by the server (from the welcome push). */
  clientIp = "";

  onRemoteStream: ((s: RemoteStream, added: boolean) => void) | null = null;
  onRemoteStreamRemoved:
    | ((peerId: string, source: string, kind: string, producerId: string) => void)
    | null = null;
  onPeerJoined: ((peerId: string, displayName: string) => void) | null = null;
  onPeerLeft: ((peerId: string) => void) | null = null;
  onAppMessage: ((peerId: string, data: AppData) => void) | null = null;
  onWbOps: ((ops: WBOp[]) => void) | null = null;

  constructor(
    readonly wsUrl: string,
    readonly roomId: string,
    readonly displayName: string
  ) {
    this.signal = new Signal(wsUrl);
    this.signal.onPush((push) => this.handlePush(push));
  }

  async join(): Promise<void> {
    await this.signal.opened;
    const joined = (await this.signal.request("join", {
      roomId: this.roomId,
      displayName: this.displayName,
    })) as unknown as {
      rtpCapabilities: RtpCapabilities;
      producers: { peerId: string; producerId: string }[];
      dataProducers?: { peerId: string; dataProducerId: string; label: string }[];
      wbOps?: WBOp[];
    };

    this.peerId = (joined as unknown as { peerId?: string }).peerId ?? "";

    await this.device.load({ routerRtpCapabilities: joined.rtpCapabilities as never });

    // Consume anything already being published in the room.
    for (const p of joined.producers) {
      await this.consume(p.producerId);
    }
    // Attach to existing app data channels (chat / files).
    for (const dp of joined.dataProducers ?? []) {
      if (dp.label === "app") await this.consumeData(dp.dataProducerId);
    }
    // Replay the whiteboard snapshot.
    if (joined.wbOps?.length && this.onWbOps) this.onWbOps(joined.wbOps);
  }

  private async createTransport(direction: "send" | "recv"): Promise<types.Transport> {
    const params = (await this.signal.request("createWebRtcTransport", {
      direction,
    })) as unknown as TransportOptions & { sctpParameters?: unknown };

    const options: types.TransportOptions = {
      id: params.id,
      iceParameters: params.iceParameters as never,
      iceCandidates: params.iceCandidates as never,
      dtlsParameters: params.dtlsParameters as never,
      sctpParameters: params.sctpParameters as never,
    };

    const transport =
      direction === "send"
        ? this.device.createSendTransport(options)
        : this.device.createRecvTransport(options);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      this.signal
        .request("connectTransport", { transportId: transport.id, dtlsParameters })
        .then(callback)
        .catch(errback);
    });

    if (direction === "send") {
      transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
        this.signal
          .request("produce", { transportId: transport.id, kind, rtpParameters, appData })
          .then(({ producerId }) => callback({ id: String(producerId) }))
          .catch(errback);
      });
      transport.on("producedata", ({ label, protocol, appData }, callback, errback) => {
        this.signal
          .request("produceData", { transportId: transport.id, label, protocol })
          .then(({ id }) => callback({ id: String(id) }))
          .catch(errback);
      });
    }

    return transport;
  }

  async publish(localStream: MediaStream): Promise<void> {
    if (!this.sendTransport) this.sendTransport = await this.createTransport("send");
    for (const track of localStream.getTracks()) {
      const producer = await this.sendTransport.produce({
        track,
        appData: { source: track.kind === "audio" ? "mic" : "cam" },
        encodings:
          track.kind === "video"
            ? [
                { rid: "r0", maxBitrate: 300_000, scaleResolutionDownBy: 4, scalabilityMode: "L1T3" },
                { rid: "r1", maxBitrate: 2_500_000, scaleResolutionDownBy: 2, scalabilityMode: "L1T3" },
                { rid: "r2", maxBitrate: 12_000_000, scaleResolutionDownBy: 1, scalabilityMode: "L1T3" },
              ]
            : undefined,
        codecOptions:
          track.kind === "video"
            ? { videoGoogleStartBitrate: 3000 }
            : { opusStereo: true, opusDtx: true, opusFec: true },
      });
      if (track.kind === "video") this.camProducer = producer;
      else this.micProducer = producer;
    }
    this.localStream = localStream;
  }

  /**
   * Start another screen share. Each call captures a new screen/window and
   * publishes it as an independent producer (own tile, own simulcast layers).
   * Returns the producer id, or null if the picker was cancelled.
   */
  async startScreenShare(): Promise<string | null> {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: false,
      });
      if (!this.sendTransport) this.sendTransport = await this.createTransport("send");
      const track = display.getVideoTracks()[0];
      const producer = await this.sendTransport!.produce({
        track,
        appData: { source: "screen" },
        encodings: [
          { rid: "r0", maxBitrate: 500_000, scaleResolutionDownBy: 4, scalabilityMode: "L1T3" },
          { rid: "r1", maxBitrate: 5_000_000, scaleResolutionDownBy: 2, scalabilityMode: "L1T3" },
          { rid: "r2", maxBitrate: 30_000_000, scaleResolutionDownBy: 1, scalabilityMode: "L1T3" },
        ],
        codecOptions: { videoGoogleStartBitrate: 5000 },
      });
      this.screens.set(producer.id, { producer, stream: display });
      track.onended = () => this.stopScreenShare(producer.id);
      return producer.id;
    } catch {
      return null;
    }
  }

  stopScreenShare(producerId: string): void {
    const s = this.screens.get(producerId);
    if (!s) return;
    if (!s.producer.closed) s.producer.close();
    s.stream.getTracks().forEach((t) => t.stop());
    this.screens.delete(producerId);
  }

  stopAllScreenShares(): void {
    for (const id of [...this.screens.keys()]) this.stopScreenShare(id);
  }

  get sharingScreen(): boolean {
    return this.screens.size > 0;
  }

  getScreenStream(producerId: string): MediaStream | null {
    return this.screens.get(producerId)?.stream ?? null;
  }

  // ---- Data channels (SCTP via the SFU — no HTTP round trips) ----

  /** Publish our app data channel; call once after publish(). */
  async initDataChannel(): Promise<void> {
    if (this.appDp && !this.appDp.closed) return;
    if (!this.sendTransport) this.sendTransport = await this.createTransport("send");
    this.appDp = await this.sendTransport!.produceData({
      label: "app",
      protocol: "visio-app-v1",
    });
  }

  sendApp(data: AppData): void {
    if (!this.appDp || this.appDp.closed) return;
    try {
      this.appDp.send(data as never);
    } catch (e) {
      console.warn("[data] send failed:", e);
    }
  }

  /** SCTP buffer occupancy in bytes, for file-transfer backpressure. */
  get appBufferedAmount(): number {
    return this.appDp?.bufferedAmount ?? 0;
  }

  private async consumeData(dataProducerId: string): Promise<void> {
    if (!this.recvTransport) this.recvTransport = await this.createTransport("recv");
    const d = (await this.signal.request("consumeData", {
      dataProducerId,
      transportId: this.recvTransport.id,
    })) as unknown as {
      id: string;
      peerId: string;
      sctpStreamParameters: unknown;
      label: string;
      protocol: string;
    };
    if (!d.peerId) return; // owner left meanwhile
    let dc: types.DataConsumer;
    try {
      dc = await this.recvTransport.consumeData({
        id: d.id,
        dataProducerId,
        sctpStreamParameters: d.sctpStreamParameters as never,
        label: d.label,
        protocol: d.protocol,
      });
    } catch {
      return;
    }
    dc.on("message", (data: unknown) => {
      this.onAppMessage?.(d.peerId, data as AppData);
    });
  }

  setTrackEnabled(kind: "audio" | "video", enabled: boolean): void {
    const track = this.localStream?.getTracks().find((t) => t.kind === kind);
    if (track) track.enabled = enabled;
    const producer = kind === "audio" ? this.micProducer : this.camProducer;
    if (!producer || producer.closed) return;
    if (enabled) void producer.resume();
    else void producer.pause();
  }

  /**
   * Apply a quality/latency mode:
   * - uplink: steer capture resolution/fps via track constraints
   * - downlink: preferred simulcast layers per received video
   * The jitter buffer target is applied by the UI layer (DOM elements).
   */
  async applyMode(profile: ModeProfile): Promise<void> {
    const camTrack = this.localStream?.getVideoTracks()[0];
    if (camTrack && camTrack.readyState === "live") {
      try {
        await camTrack.applyConstraints({
          height: profile.maxHeight ? { ideal: profile.maxHeight, max: 2160 } : { ideal: 2160 },
          frameRate: profile.maxFps
            ? { ideal: profile.maxFps, max: profile.maxFps }
            : { ideal: 60 },
        });
      } catch {
        /* device may not support requested constraints */
      }
    }

    for (const entry of this.consumers.values()) {
      if (entry.consumer.kind !== "video") continue;
      if (entry.consumer.closed) continue;
      await this.signal.request("setConsumerPreferredLayers", {
        consumerId: entry.consumer.id,
        spatialLayer: Math.min(profile.preferredSpatialLayer, 2),
        temporalLayer: Math.min(profile.preferredTemporalLayer, 2),
      });
    }
  }

  private async consume(producerId: string, sourceHint?: string): Promise<void> {
    if (!this.recvTransport) this.recvTransport = await this.createTransport("recv");
    const data = (await this.signal.request("consume", {
      producerId,
      transportId: this.recvTransport.id,
      rtpCapabilities: this.device.rtpCapabilities,
    })) as unknown as ConsumerOptions & { consumerId: string };

    const consumer = await this.recvTransport.consume({
      id: data.consumerId,
      producerId: data.producerId,
      kind: data.kind as types.MediaKind,
      rtpParameters: data.rtpParameters as never,
      appData: {},
    });

    const source =
      (data.appData as { source?: string } | undefined)?.source ?? sourceHint ?? "cam";

    this.consumers.set(producerId, {
      consumer,
      peerId: data.peerId,
      source,
      producerId,
    });
    consumer.on("transportclose", () => this.consumers.delete(producerId));

    // Attach the track first so the first frames are not dropped, then resume.
    const stream = new MediaStream([consumer.track]);
    this.onRemoteStream?.(
      {
        peerId: data.peerId,
        source,
        key: source === "screen" ? `screen:${producerId}` : "cam",
        kind: data.kind as "audio" | "video",
        stream,
      },
      true
    );
    await this.signal.request("resumeConsumer", { consumerId: consumer.id });
  }

  private removeConsumersOf(producerId: string): void {
    const entry = this.consumers.get(producerId);
    if (!entry) return;
    if (!entry.consumer.closed) entry.consumer.close();
    this.consumers.delete(producerId);
    this.onRemoteStreamRemoved?.(
      entry.peerId,
      entry.source,
      entry.consumer.kind,
      producerId
    );
  }

  /** Raw WebRTC stats from both transports, for the network panel. */
  async getStats(): Promise<{ send: unknown; recv: unknown }> {
    const send = this.sendTransport
      ? await this.sendTransport.getStats().catch(() => null)
      : null;
    const recv = this.recvTransport
      ? await this.recvTransport.getStats().catch(() => null)
      : null;
    return { send, recv };
  }

  private handlePush(push: import("@visio/shared").ServerResponse): void {
    switch (push.type) {
      case "welcome":
        this.clientIp = push.clientIp;
        break;
      case "newPeer":
        this.onPeerJoined?.(push.peer.peerId, push.peer.displayName);
        break;
      case "peerLeft":
        this.onPeerLeft?.(push.peerId);
        break;
      case "newProducer":
        if (push.appData && typeof push.appData === "object") {
          void this.consume(
            push.producerId,
            (push.appData as { source?: string }).source
          );
        } else {
          void this.consume(push.producerId);
        }
        break;
      case "producerClosed":
        this.removeConsumersOf(push.producerId);
        break;
      case "newDataProducer":
        if (push.label === "app") void this.consumeData(push.dataProducerId);
        break;
      case "wbOps":
        this.onWbOps?.(push.ops);
        break;
    }
  }

  close(): void {
    this.stopAllScreenShares();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.signal.close();
  }
}
