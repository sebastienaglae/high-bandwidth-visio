import os from "node:os";
import * as mediasoup from "mediasoup";
import type {
  Router,
  WebRtcTransport,
  Worker,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  TransportListenIp,
} from "mediasoup/types";
import { config } from "./config.js";
import { randomRoomToken, newId } from "./ids.js";

export interface Peer {
  id: string;
  displayName: string;
  socket: import("ws").WebSocket;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  dataProducers: Map<string, import("mediasoup/types").DataProducer>;
  dataConsumers: Map<string, import("mediasoup/types").DataConsumer>;
  closed: boolean;
  /** Set while waiting for the client to resume after a WS drop. */
  disconnected?: boolean;
  disconnectTimer?: NodeJS.Timeout;
}

export class Room {
  readonly id: string;
  readonly router: Router;
  readonly createdAt = Date.now();
  wbOps: import("@visio/shared").WBOp[] = [];
  hostPeerId: string | null = null;
  locked = false;
  lastSpeakerPeerId: string | null = null;
  private peers = new Map<string, Peer>();

  constructor(id: string, router: Router) {
    this.id = id;
    this.router = router;
    void this.setupAudioLevelObserver();
  }

  private async setupAudioLevelObserver(): Promise<void> {
    try {
      const observer = await this.router.createAudioLevelObserver({
        threshold: -70,
        interval: 800,
      });
      observer.on("volumes", (volumes) => {
        const top = volumes[0];
        if (!top) return;
        const speaker = this.ownerOf(top.producer.id);
        if (!speaker || speaker === this.lastSpeakerPeerId) return;
        this.lastSpeakerPeerId = speaker;
        this.broadcast({ type: "activeSpeaker", peerId: speaker });
      });
    } catch {
      /* observer unavailable; active-speaker highlighting stays off */
    }
  }

  private ownerOf(producerId: string): string | null {
    for (const peer of this.peers.values()) {
      if (peer.producers.has(producerId)) return peer.id;
    }
    return null;
  }

  roleOf(peerId: string): "host" | "guest" {
    return this.hostPeerId === peerId ? "host" : "guest";
  }

  get rtpCapabilities(): RtpCapabilities {
    return this.router.rtpCapabilities;
  }

  addPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
    // First participant becomes the host.
    if (!this.hostPeerId) this.hostPeerId = peer.id;
  }

  isFull(): boolean {
    return this.peers.size >= config.limits.maxPeersPerRoom;
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  removePeer(peerId: string): Peer | undefined {
    const peer = this.peers.get(peerId);
    this.peers.delete(peerId);
    // Host migration: oldest remaining peer takes over.
    if (peer && this.hostPeerId === peerId) {
      this.promoteNextHost(peerId);
    }
    return peer;
  }

  /** Called when a peer's socket drops; host migrates immediately. */
  onPeerDisconnected(peerId: string): void {
    if (this.hostPeerId === peerId) this.promoteNextHost(peerId);
  }

  private promoteNextHost(excludePeerId: string): void {
    const next = [...this.peers.values()].find((p) => p.id !== excludePeerId);
    if (next) {
      this.hostPeerId = next.id;
      this.broadcast({ type: "roleChanged", peerId: next.id, role: "host" });
    } else {
      this.hostPeerId = null;
    }
  }

  listPeers(): { peerId: string; displayName: string }[] {
    return [...this.peers.values()].map((p) => ({
      peerId: p.id,
      displayName: p.displayName,
    }));
  }

  isEmpty(): boolean {
    return this.peers.size === 0;
  }

  broadcast(message: unknown, exceptPeerId?: string): void {
    const data = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (exceptPeerId && peer.id === exceptPeerId) continue;
      if (peer.socket.readyState === peer.socket.OPEN) {
        peer.socket.send(data);
      }
    }
  }
}

const rooms = new Map<string, Room>();
let nextWorkerIndex = 0;
const workers: Worker[] = [];

export async function ensureWorkers(count: number): Promise<void> {
  for (let i = workers.length; i < count; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.rtcMinPort,
      rtcMaxPort: config.rtcMaxPort,
    });
    worker.on("died", (error) => {
      console.error(`[sfu] worker ${worker.pid} died:`, error);
      setTimeout(() => process.exit(1), 2000);
    });
    workers.push(worker);
  }
}

function nextWorker(): Worker {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Rooms are created implicitly when the first participant opens a link. */
export async function getOrCreateRoom(roomId: string): Promise<Room> {
  if (!ROOM_ID_RE.test(roomId)) throw new Error("invalid room id");
  let room = rooms.get(roomId);
  if (!room) {
    if (rooms.size >= config.limits.maxRooms) {
      throw new Error("server room capacity reached");
    }
    // One router per room; workers round-robin across CPU cores.
    await ensureWorkers(Math.max(1, Math.min(osCores(), 4)));
    const router = await nextWorker().createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs,
    });
    room = new Room(roomId, router);
    rooms.set(roomId, room);
    console.log(`[room] created ${roomId}`);
  }
  return room;
}

export function closeRoomIfEmpty(roomId: string): void {
  const room = rooms.get(roomId);
  if (room && room.isEmpty()) {
    room.router.close();
    rooms.delete(roomId);
    console.log(`[room] closed ${roomId}`);
  }
}

/** Locate a peer waiting to resume (any room). */
export function findDisconnectedPeer(
  peerId: string
): { peer: Peer; room: Room } | undefined {
  for (const room of rooms.values()) {
    const peer = room.getPeer(peerId);
    if (peer && peer.disconnected) return { peer, room };
  }
  return undefined;
}

/**
 * Resolve the bind IP + announced IP for WebRTC transports.
 * - ANNOUNCED_IP env wins when set (production behind NAT/Docker).
 * - Loopback dev: bind 127.0.0.1, announce nothing (same-host browsers reach
 *   the loopback candidate; for LAN testing set LISTEN_IP to the LAN IP).
 * - 0.0.0.0: mediasoup needs a concrete interface; use primary NIC.
 * The announced IP must always be an IP we actually listen on.
 */
export function resolveListenIps(): TransportListenIp[] {
  let bind = config.listenIp;
  let announce = config.announcedIp;

  if (!announce) {
    if (listenIpIsLoopback(bind)) {
      announce = undefined; // never advertise an IP we are not bound to
    } else if (!isUnspecified(bind)) {
      announce = bind;
    }
    // unspecified + no ANNOUNCED_IP: leave undefined; config validation
    // refuses this combination in production.
  }

  if (isUnspecified(bind)) {
    bind = announce ?? config.primaryInterfaceIp();
  }

  return [{ ip: bind, announcedIp: announce }];
}

export async function createWebRtcTransport(
  room: Room
): Promise<WebRtcTransport> {
  const transport = await room.router.createWebRtcTransport({
    listenIps: resolveListenIps(),
    enableUdp: config.mediasoup.webRtcTransport.enableUdp,
    enableTcp: config.mediasoup.webRtcTransport.enableTcp,
    preferUdp: config.mediasoup.webRtcTransport.preferUdp,
    enableSctp: true,
    maxSendMessageSize: config.mediasoup.webRtcTransport.maxSctpMessageSize,
    initialAvailableOutgoingBitrate:
      config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate,
  });

  transport.on("dtlsstatechange", (state: string) => {
    if (state === "closed" || state === "failed") {
      console.warn(`[transport] ${transport.id} dtls ${state}`);
    }
  });

  try {
    await transport.setMaxIncomingBitrate(
      config.mediasoup.webRtcTransport.maxIncomingBitrate
    );
  } catch {
    /* not supported by all versions */
  }

  return transport;
}

export { randomRoomToken, newId };

function osCores(): number {
  return os.cpus().length;
}

function listenIpIsLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function isUnspecified(ip: string): boolean {
  return ip === "0.0.0.0" || ip === "::";
}

