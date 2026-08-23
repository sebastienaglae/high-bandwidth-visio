import type { WebSocket, RawData } from "ws";
import type { DtlsParameters } from "mediasoup/types";
import type { ClientMessage, ServerResponse, TraceResult } from "@visio/shared";
import {
  getOrCreateRoom,
  closeRoomIfEmpty,
  createWebRtcTransport,
} from "./rooms.js";
import type { Peer, Room } from "./rooms.js";
import { newId } from "./ids.js";
import { traceAndEnrich } from "./net/enrich.js";
import { config } from "./config.js";
import { validateWbOps } from "@visio/shared";

interface Session {
  peer: Peer | null;
  clientIp: string;
  lastPathHash: string | null;
  routeWatchTimer: NodeJS.Timeout | null;
  msgBucket: { tokens: number; last: number };
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function allowMessage(session: Session): boolean {
  const now = Date.now();
  const b = session.msgBucket;
  b.tokens = Math.min(
    config.limits.signalingMsgsPerSec,
    b.tokens + ((now - b.last) / 1000) * config.limits.signalingMsgsPerSec
  );
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function send(socket: WebSocket, message: ServerResponse): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function respond(socket: WebSocket, requestId: number, data: Record<string, unknown>): void {
  send(socket, { type: "response", requestId, data });
}

function requestIdOf(msg: ClientMessage): number {
  return (msg as unknown as { requestId?: number }).requestId ?? -1;
}

async function handleMessage(
  session: Session,
  socket: WebSocket,
  msg: ClientMessage
): Promise<void> {
  const requestId = requestIdOf(msg);

  switch (msg.type) {
    case "join": {
      if (session.peer) throw new Error("already joined");
      if (!ROOM_ID_RE.test(msg.roomId)) throw new Error("invalid room id");
      const room = await getOrCreateRoom(msg.roomId);
      if (room.isFull()) throw new Error("room is full");
      const peer = createPeer(session, room, socket, msg.displayName);
      session.peer = peer;

      const producers = snapshotProducers(room);
      const dataProducers = snapshotDataProducers(room);

      respond(socket, requestId, {
        peerId: peer.id,
        roomId: room.id,
        rtpCapabilities: room.router.rtpCapabilities,
        peers: room.listPeers().filter((p) => p.peerId !== peer.id),
        producers,
        dataProducers,
        wbOps: room.wbOps,
      });

      room.broadcast(
        {
          type: "newPeer",
          peer: { peerId: peer.id, displayName: peer.displayName },
        },
        peer.id
      );
      break;
    }

    case "createWebRtcTransport": {
      const peer = requirePeer(session);
      if (peer.transports.size >= config.limits.maxTransportsPerPeer) {
        throw new Error("transport limit reached");
      }
      const room = requireRoom(peer);
      const transport = await createWebRtcTransport(room);
      peer.transports.set(transport.id, transport);
      respond(socket, requestId, {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
      break;
    }

    case "connectTransport": {
      const peer = requirePeer(session);
      const transport = peer.transports.get(msg.transportId);
      if (!transport) throw new Error("transport not found");
      await transport.connect({ dtlsParameters: msg.dtlsParameters as DtlsParameters });
      respond(socket, requestId, {});
      break;
    }

    case "produce": {
      const peer = requirePeer(session);
      if (peer.producers.size >= config.limits.maxProducersPerPeer) {
        throw new Error("producer limit reached");
      }
      const room = requireRoom(peer);
      const transport = peer.transports.get(msg.transportId);
      if (!transport) throw new Error("transport not found");
      const producer = await transport.produce({
        kind: msg.kind,
        rtpParameters: msg.rtpParameters as never,
        appData: msg.appData ?? {},
      });
      peer.producers.set(producer.id, producer);
      producer.observer.once("close", () => {
        peer.producers.delete(producer.id);
        room.broadcast({ type: "producerClosed", producerId: producer.id });
      });
      respond(socket, requestId, { producerId: producer.id });

      room.broadcast(
        {
          type: "newProducer",
          peerId: peer.id,
          producerId: producer.id,
          kind: msg.kind,
          appData: (producer.appData ?? {}) as Record<string, unknown>,
        },
        peer.id
      );
      break;
    }

    case "consume": {
      const peer = requirePeer(session);
      const room = requireRoom(peer);
      const caps = msg.rtpCapabilities;
      if (!room.router.canConsume({ producerId: msg.producerId, rtpCapabilities: caps as never })) {
        throw new Error("client cannot consume this producer");
      }
      const transport = peer.transports.get(msg.transportId);
      if (!transport) throw new Error("recv transport not found");

      const consumer = await transport.consume({
        producerId: msg.producerId,
        rtpCapabilities: caps as never,
        paused: true,
      });
      peer.consumers.set(consumer.id, consumer);
      consumer.on("producerclose", () => {
        peer.consumers.delete(consumer.id);
        consumer.close();
        send(socket, { type: "producerClosed", producerId: msg.producerId });
      });

      const owner = findProducerOwner(room, msg.producerId);

      respond(socket, requestId, {
        consumerId: consumer.id,
        producerId: msg.producerId,
        peerId: owner.peerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData: { source: owner.source },
      });
      break;
    }

    case "setConsumerPreferredLayers": {
      const peer = requirePeer(session);
      const consumer = peer.consumers.get(msg.consumerId);
      if (!consumer) throw new Error("consumer not found");
      await consumer.setPreferredLayers({
        spatialLayer: msg.spatialLayer,
        temporalLayer: msg.temporalLayer,
      });
      respond(socket, requestId, {});
      break;
    }

    case "resumeConsumer": {
      const peer = requirePeer(session);
      const consumer = peer.consumers.get(msg.consumerId);
      if (!consumer) throw new Error("consumer not found");
      await consumer.resume();
      respond(socket, requestId, {});
      break;
    }

    case "closeConsumer": {
      const peer = requirePeer(session);
      const consumer = peer.consumers.get(msg.consumerId);
      if (consumer) {
        peer.consumers.delete(consumer.id);
        consumer.close();
      }
      respond(socket, requestId, {});
      break;
    }

    case "pauseProducer":
    case "resumeProducer": {
      const peer = requirePeer(session);
      const producer = peer.producers.get(msg.producerId);
      if (!producer) throw new Error("producer not found");
      if (msg.type === "pauseProducer") await producer.pause();
      else await producer.resume();
      respond(socket, requestId, {});
      break;
    }

    case "traceroute": {      const target = normalizeTarget(msg.target, session.clientIp);
      const result = await runTrace(session, socket, target);
      respond(socket, requestId, { ...result });
      break;
    }

    case "ping": {
      respond(socket, requestId, { t: Date.now() });
      break;
    }

    case "setRouteWatch": {
      if (session.routeWatchTimer) {
        clearInterval(session.routeWatchTimer);
        session.routeWatchTimer = null;
      }
      if (msg.enabled) {
        const intervalSec = Math.max(10, Math.min(msg.intervalSec ?? 30, 300));
        const tick = async () => {
          try {
            await runTrace(session, socket, session.clientIp);
          } catch (error) {
            console.error("[trace] watch failed:", error);
          }
        };
        void tick();
        session.routeWatchTimer = setInterval(tick, intervalSec * 1000);
      }
      respond(socket, requestId, {});
      break;
    }

    case "produceData": {
      const peer = requirePeer(session);
      if (peer.dataProducers.size >= config.limits.maxDataProducersPerPeer) {
        throw new Error("data producer limit reached");
      }
      const room = requireRoom(peer);
      const transport = peer.transports.get(msg.transportId);
      if (!transport) throw new Error("transport not found");
      // mediasoup requires explicit SCTP stream params when producing data
      // server-side; allocate the next free stream id for this peer.
      let streamId = 0;
      for (const dp of peer.dataProducers.values()) {
        const sid = (dp.sctpStreamParameters as { streamId?: number } | undefined)?.streamId ?? -1;
        if (sid >= streamId) streamId = sid + 1;
      }
      const dp = await transport.produceData({
        label: String(msg.label || "app").slice(0, 32),
        protocol: String(msg.protocol || "").slice(0, 32),
        sctpStreamParameters: { streamId, ordered: true },
      });
      peer.dataProducers.set(dp.id, dp);
      dp.observer.once("close", () => {
        peer.dataProducers.delete(dp.id);
        room.broadcast({ type: "dataProducerClosed", dataProducerId: dp.id });
      });
      respond(socket, requestId, {
        id: dp.id,
        sctpStreamParameters: dp.sctpStreamParameters,
        label: dp.label,
        protocol: dp.protocol,
      });
      room.broadcast(
        {
          type: "newDataProducer",
          peerId: peer.id,
          dataProducerId: dp.id,
          label: dp.label,
        },
        peer.id
      );
      break;
    }

    case "consumeData": {
      const peer = requirePeer(session);
      if (peer.dataConsumers.size >= config.limits.maxDataConsumersPerPeer) {
        throw new Error("data consumer limit reached");
      }
      const room = requireRoom(peer);
      const transport = peer.transports.get(msg.transportId);
      if (!transport) throw new Error("recv transport not found");
      const dc = await transport.consumeData({
        dataProducerId: msg.dataProducerId,
      });
      peer.dataConsumers.set(dc.id, dc);
      dc.on("dataproducerclose", () => {
        peer.dataConsumers.delete(dc.id);
        send(socket, { type: "dataProducerClosed", dataProducerId: msg.dataProducerId });
      });
      const owner = findDataProducerOwner(room, msg.dataProducerId);
      respond(socket, requestId, {
        id: dc.id,
        dataProducerId: msg.dataProducerId,
        peerId: owner,
        sctpStreamParameters: dc.sctpStreamParameters,
        label: dc.label,
        protocol: dc.protocol,
      });
      break;
    }

    case "wbOp": {
      const peer = requirePeer(session);
      const room = requireRoom(peer);
      const ops = validateWbOps(msg.ops);
      if (!ops) throw new Error("invalid whiteboard ops");
      room.wbOps.push(...ops);
      // Cap history; clear markers reset context.
      if (room.wbOps.length > config.limits.maxWbOps) {
        room.wbOps.splice(0, room.wbOps.length - config.limits.maxWbOps);
      }
      room.broadcast({ type: "wbOps", ops }, peer.id);
      respond(socket, requestId, {});
      break;
    }

    case "wbClear": {
      const peer = requirePeer(session);
      const room = requireRoom(peer);
      room.wbOps = [];
      room.broadcast({ type: "wbOps", ops: [{ k: "clear" }] });
      respond(socket, requestId, {});
      break;
    }

    default:
      throw new Error(`unsupported message`);
  }
}

const IPV4_RE = /^(\d{1,3}(?:\.\d{1,3}){3})$/;

function normalizeTarget(requested: string | undefined, clientIp: string): string {
  const t = requested ?? clientIp;
  // Only public IPv4 targets are traceable in this milestone; strip port from x-forwarded-for.
  const bare = t.split(",")[0].trim().split(":")[0];
  return IPV4_RE.test(bare) ? bare : clientIp.split(":").pop() ?? clientIp;
}

async function runTrace(
  session: Session,
  socket: WebSocket,
  target: string
): Promise<TraceResult> {
  const result = await traceAndEnrich(target);
  const changed = session.lastPathHash !== null && result.pathHash !== session.lastPathHash;
  result.changed = changed;
  session.lastPathHash = result.pathHash;
  if (changed) {
    send(socket, { type: "routeChanged", result });
  }
  return result;
}

function createPeer(
  session: Session,
  room: Room,
  socket: WebSocket,
  displayName: string
): Peer {
  const peer: Peer = {
    id: newId("peer"),
    displayName: String(displayName || "Guest").slice(0, 32),
    socket,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    dataProducers: new Map(),
    dataConsumers: new Map(),
    closed: false,
  };
  room.addPeer(peer);
  bindRoom(peer, room);
  session.peer = peer;
  return peer;
}

const peerRooms = new WeakMap<Peer, Room>();

export function bindRoom(peer: Peer, room: Room): void {
  peerRooms.set(peer, room);
}

function requirePeer(session: Session): Peer {
  if (!session.peer || session.peer.closed) throw new Error("not joined");
  return session.peer;
}

function requireRoom(peer: Peer): Room {
  const room = peerRooms.get(peer);
  if (!room) throw new Error("room gone");
  return room;
}

function snapshotProducers(room: Room) {
  const out: {
    peerId: string;
    producerId: string;
    kind: "audio" | "video";
    appData: Record<string, unknown>;
  }[] = [];
  for (const info of room.listPeers()) {
    const other = room.getPeer(info.peerId);
    if (!other) continue;
    for (const [producerId, producer] of other.producers) {
      out.push({
        peerId: other.id,
        producerId,
        kind: producer.kind,
        appData: (producer.appData ?? {}) as Record<string, unknown>,
      });
    }
  }
  return out;
}

function findProducerOwner(room: Room, producerId: string): { peerId: string; source: string } {
  for (const info of room.listPeers()) {
    const peer = room.getPeer(info.peerId);
    const producer = peer?.producers.get(producerId);
    if (peer && producer) {
      const source = (producer.appData as { source?: string } | undefined)?.source ?? "cam";
      return { peerId: peer.id, source };
    }
  }
  return { peerId: "", source: "cam" };
}

function findDataProducerOwner(room: Room, dataProducerId: string): string {
  for (const info of room.listPeers()) {
    const peer = room.getPeer(info.peerId);
    if (peer?.dataProducers.has(dataProducerId)) return info.peerId;
  }
  return "";
}

function snapshotDataProducers(room: Room): {
  peerId: string;
  dataProducerId: string;
  label: string;
}[] {
  const out: { peerId: string; dataProducerId: string; label: string }[] = [];
  for (const info of room.listPeers()) {
    const other = room.getPeer(info.peerId);
    if (!other) continue;
    for (const [dpId, dp] of other.dataProducers) {
      out.push({ peerId: other.id, dataProducerId: dpId, label: dp.label });
    }
  }
  return out;
}

export function handleConnection(socket: WebSocket, clientIp: string): void {
  const session: Session = {
    peer: null,
    clientIp,
    lastPathHash: null,
    routeWatchTimer: null,
    msgBucket: { tokens: config.limits.signalingMsgsPerSec, last: Date.now() },
  };
  let chain: Promise<void> = Promise.resolve();
  let dropped = 0;

  // Tell clients their public IP as seen by the server (first push on connect).
  send(socket, { type: "welcome", clientIp });

  socket.on("message", (raw: RawData) => {
    if (!allowMessage(session)) {
      dropped++;
      if (dropped === 1 || dropped % 100 === 0) {
        console.warn(`[signaling] rate-limiting ${session.clientIp} (${dropped} dropped)`);
      }
      return;
    }
    chain = chain.then(async () => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      try {
        await handleMessage(session, socket, msg);
      } catch (error) {
        console.error("[signaling]", error instanceof Error ? error.message : error);
        send(socket, {
          type: "error",
          requestId: requestIdOf(msg),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  socket.on("close", () => {
    if (session.routeWatchTimer) clearInterval(session.routeWatchTimer);
    const peer = session.peer;
    if (!peer || peer.closed) return;
    peer.closed = true;
    const room = peerRooms.get(peer);
    for (const t of peer.transports.values()) t.close();
    peer.transports.clear();
    peer.producers.clear();
    peer.consumers.clear();
    peer.dataProducers.clear();
    peer.dataConsumers.clear();
    if (room) {
      room.removePeer(peer.id);
      room.broadcast({ type: "peerLeft", peerId: peer.id });
      closeRoomIfEmpty(room.id);
    }
  });
}
