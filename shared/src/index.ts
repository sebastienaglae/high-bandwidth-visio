export type RtpCapabilities = {
  codecs?: unknown[];
  headerExtensions?: unknown[];
};

export type DtlsParameters = {
  role?: string;
  fingerprints: { algorithm: string; value: string }[];
};

export type IceParameters = {
  usernameFragment: string;
  password: string;
  iceLite?: boolean;
};

export type IceCandidate = {
  foundation: string;
  priority: number;
  ip: string;
  address?: string;
  protocol: string;
  port: number;
  type: string;
};

export type TransportOptions = {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
  /** Present when the transport was created with SCTP enabled. */
  sctpParameters?: {
    port: number;
    OS: number;
    MIS: number;
    maxMessageSize: number;
  };
};

export interface AppData {
  [key: string]: unknown;
}

// ---- Client -> Server ----

export interface JoinRequest {
  type: "join";
  roomId: string;
  displayName: string;
}

export interface CreateTransportRequest {
  type: "createWebRtcTransport";
  direction: "send" | "recv";
}

export interface ConnectTransportRequest {
  type: "connectTransport";
  transportId: string;
  dtlsParameters: DtlsParameters;
}

export interface ProduceRequest {
  type: "produce";
  transportId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  appData?: AppData;
}

export interface ConsumeRequest {
  type: "consume";
  producerId: string;
  transportId: string;
  rtpCapabilities: RtpCapabilities;
}

export interface ResumeConsumerRequest {
  type: "resumeConsumer";
  consumerId: string;
}

export interface CloseConsumerRequest {
  type: "closeConsumer";
  consumerId: string;
}

export interface PauseRequest {
  type: "pauseProducer" | "resumeProducer";
  producerId: string;
}

export type ClientMessage =
  | JoinRequest
  | CreateTransportRequest
  | ConnectTransportRequest
  | ProduceRequest
  | ConsumeRequest
  | ResumeConsumerRequest
  | CloseConsumerRequest
  | PauseRequest
  | SetConsumerPreferredLayersRequest
  | TracerouteRequest
  | RouteWatchRequest
  | PingRequest
  | ProduceDataRequest
  | ConsumeDataRequest
  | WbOpRequest
  | WbClearRequest
  | WbUndoRequest
  | ResumeRequest
  | ModerateRequest;

// ---- Server -> Client (requests/responses + events) ----

export interface PeerInfo {
  peerId: string;
  displayName: string;
}

export interface JoinedEvent {
  type: "joined";
  peerId: string;
  roomId: string;
  role: Role;
  locked: boolean;
  hostPeerId: string;
  rtpCapabilities: RtpCapabilities;
  peers: PeerInfo[];
  producers: {
    peerId: string;
    producerId: string;
    kind: "audio" | "video";
    appData: AppData;
  }[];
  dataProducers: {
    peerId: string;
    dataProducerId: string;
    label: string;
  }[];
  wbOps: import("./wb.js").WBOp[];
}

export interface NewPeerEvent {
  type: "newPeer";
  peer: PeerInfo;
}

export interface PeerLeftEvent {
  type: "peerLeft";
  peerId: string;
}

export interface NewProducerEvent {
  type: "newProducer";
  peerId: string;
  producerId: string;
  kind: "audio" | "video";
  appData: AppData;
}

export interface ProducerClosedEvent {
  type: "producerClosed";
  producerId: string;
}

export interface ConsumerOptions {
  type: "consumerCreated";
  consumerId: string;
  producerId: string;
  peerId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  appData: AppData;
}

export interface ErrorResponse {
  type: "error";
  requestId?: number;
  message: string;
}

export type ServerPush =
  | JoinedEvent
  | NewPeerEvent
  | PeerLeftEvent
  | NewProducerEvent
  | ProducerClosedEvent
  | WelcomePush
  | RouteChangedPush
  | NewDataProducerEvent
  | DataProducerClosedEvent
  | WbOpsPush
  | WbUndoPush
  | ActiveSpeakerPush
  | ModeratedPush
  | RoleChangedPush
  | RoomLockedPush
  | KickedPush;

export type ServerResponse =
  | {
      type: "response";
      requestId: number;
      data: Record<string, unknown>;
    }
  | ErrorResponse
  | ServerPush;

// ---- Quality / latency modes ----

export const MODES = ["ultra", "low", "balanced", "high", "max"] as const;
export type Mode = (typeof MODES)[number];

export interface ModeProfile {
  mode: Mode;
  label: string;
  description: string;
  /** Capture constraints applied to the local camera track (uplink). */
  maxHeight: number | null; // null = native
  maxFps: number | null; // null = native
  /** Preferred simulcast spatial/temporal layers for received video. */
  preferredSpatialLayer: number;
  preferredTemporalLayer: number;
  /** Receiver-side jitter buffer target in ms (null = browser default). */
  jitterBufferTargetMs: number | null;
}

export const MODE_PROFILES: Record<Mode, ModeProfile> = {
  ultra: {
    mode: "ultra",
    label: "Ultra low latency",
    description: "<80ms glass-to-glass · 720p30",
    maxHeight: 720,
    maxFps: 30,
    preferredSpatialLayer: 1,
    preferredTemporalLayer: 0,
    jitterBufferTargetMs: null,
  },
  low: {
    mode: "low",
    label: "Low latency",
    description: "~150ms · 1080p30",
    maxHeight: 1080,
    maxFps: 30,
    preferredSpatialLayer: 2,
    preferredTemporalLayer: 1,
    jitterBufferTargetMs: 50,
  },
  balanced: {
    mode: "balanced",
    label: "Balanced",
    description: "default · 1440p30",
    maxHeight: 1440,
    maxFps: 30,
    preferredSpatialLayer: 2,
    preferredTemporalLayer: 2,
    jitterBufferTargetMs: 100,
  },
  high: {
    mode: "high",
    label: "High quality",
    description: "~300ms buffer · 1440p60",
    maxHeight: 1440,
    maxFps: 60,
    preferredSpatialLayer: 2,
    preferredTemporalLayer: 2,
    jitterBufferTargetMs: 200,
  },
  max: {
    mode: "max",
    label: "Maximum quality",
    description: "watch mode · native res/fps",
    maxHeight: null,
    maxFps: null,
    preferredSpatialLayer: 2,
    preferredTemporalLayer: 2,
    jitterBufferTargetMs: 350,
  },
};

export interface SetConsumerPreferredLayersRequest {
  type: "setConsumerPreferredLayers";
  consumerId: string;
  spatialLayer: number;
  temporalLayer: number;
}

// ---- Network diagnostics ----

export interface HopInfo {
  hop: number;
  ip: string | null;
  rttMs: number | null;
  asn?: number;
  org?: string;
  country?: string;
}

export interface TraceResult {
  target: string;
  hops: HopInfo[];
  pathHash: string;
  timestamp: number;
  changed?: boolean;
}

export interface TracerouteRequest {
  type: "traceroute";
  target?: string; // defaults to the requesting client's public IP
}

export interface RouteWatchRequest {
  type: "setRouteWatch";
  enabled: boolean;
  intervalSec?: number;
}

export interface PingRequest {
  type: "ping";
}

/** Resume a dropped session: media keeps flowing during the grace window. */
export interface ResumeRequest {
  type: "resume";
  peerId: string;
  resumeToken: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcConfig {
  iceServers: IceServer[];
}

// ---- Moderation & presence ----

export type Role = "host" | "guest";

export interface ModerateRequest {
  type: "moderate";
  action: "mute" | "kick" | "lock" | "unlock";
  targetPeerId?: string;
}

export interface ActiveSpeakerPush {
  type: "activeSpeaker";
  peerId: string;
}

export interface ModeratedPush {
  type: "moderated";
  action: "mute";
  targetPeerId: string;
  by: string;
}

export interface RoleChangedPush {
  type: "roleChanged";
  peerId: string;
  role: Role;
}

export interface RoomLockedPush {
  type: "roomLocked";
}

export interface KickedPush {
  type: "kicked";
}

export interface WelcomePush {
  type: "welcome";
  clientIp: string;
}

export interface RouteChangedPush {
  type: "routeChanged";
  result: TraceResult;
}

// ---- Data channels (chat / files / presence over SCTP) ----

export interface ProduceDataRequest {
  type: "produceData";
  transportId: string;
  label: string;
  protocol: string;
}

export interface ConsumeDataRequest {
  type: "consumeData";
  dataProducerId: string;
  transportId: string;
}

export interface NewDataProducerEvent {
  type: "newDataProducer";
  peerId: string;
  dataProducerId: string;
  label: string;
}

export interface DataProducerClosedEvent {
  type: "dataProducerClosed";
  dataProducerId: string;
}

// ---- Whiteboard (signaling-relayed ops + join snapshot) ----

export interface WbOpRequest {
  type: "wbOp";
  ops: import("./wb.js").WBOp[];
}

export interface WbClearRequest {
  type: "wbClear";
}

export interface WbUndoRequest {
  type: "wbUndo";
  id: string;
}

export interface WbUndoPush {
  type: "wbUndo";
  id: string;
}

export interface WbOpsPush {
  type: "wbOps";
  ops: import("./wb.js").WBOp[];
}

export { validateWbOps } from "./wb.js";
export type { WBOp, WBStroke } from "./wb.js";

