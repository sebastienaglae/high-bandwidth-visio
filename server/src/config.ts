import os from "node:os";

const listenIp = process.env.LISTEN_IP || "127.0.0.1";
const announcedIp = process.env.ANNOUNCED_IP || undefined;
const port = Number(process.env.PORT || 8080);

// RTC ports range on the VPS. Open UDP 40000-40100/udp in the firewall.
const rtcMinPort = Number(process.env.RTC_MIN_PORT || 40000);
const rtcMaxPort = Number(process.env.RTC_MAX_PORT || 40100);

function primaryInterfaceIp(): string {
  const ifaces = Object.values(os.networkInterfaces()).flat();
  const cand = ifaces.find(
    (i) => i && i.family === "IPv4" && !i.internal
  );
  return cand?.address ?? "127.0.0.1";
}

// Only inherit LISTEN_IP as the announced address when it is a concrete,
// non-loopback, non-wildcard interface IP.
const canAutoAnnounce =
  listenIp !== "127.0.0.1" &&
  listenIp !== "::1" &&
  listenIp !== "0.0.0.0" &&
  listenIp !== "::";

export const config = {
  port,
  listenIp,
  announcedIp: announcedIp ?? (canAutoAnnounce ? listenIp : undefined),
  autoDetectAnnounced: !announcedIp,
  primaryInterfaceIp,
  rtcMinPort,
  rtcMaxPort,
  // Trust X-Forwarded-For (set only when behind the Caddy/reverse proxy).
  trustProxy: process.env.TRUST_PROXY === "1",
  isProd: process.env.NODE_ENV === "production",
  limits: {
    maxRooms: Number(process.env.MAX_ROOMS || 200),
    maxPeersPerRoom: Number(process.env.MAX_PEERS_PER_ROOM || 24),
    maxTransportsPerPeer: 8,
    maxProducersPerPeer: 6,
    maxDataProducersPerPeer: 3,
    maxDataConsumersPerPeer: 32,
    signalingMsgsPerSec: 60,
    resumeGraceMs: Number(process.env.RESUME_GRACE_MS || 15_000),
    maxWbOps: 1500,
    speedtestCooldownMs: Number(process.env.SPEEDTEST_COOLDOWN_MS || 30_000),
    maxSpeedtestBytes: 256_000_000,
    minSpeedtestBytes: 1_000_000,
  },
  mediasoup: {
    worker: {
      logLevel: "warn" as const,
      logTags: ["info" as const, "ice" as const, "dtls" as const, "rtp" as const],
    },
    router: {
      mediaCodecs: [
        {
          kind: "audio" as const,
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video" as const,
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: { "x-google-start-bitrate": 3000 },
        },
        {
          kind: "video" as const,
          mimeType: "video/VP9",
          clockRate: 90000,
          parameters: {
            "profile-id": 2,
            "x-google-start-bitrate": 3000,
          },
        },
        {
          kind: "video" as const,
          mimeType: "video/h264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1,
            "x-google-start-bitrate": 3000,
          },
        },
      ],
    },
    webRtcTransport: {
      initialAvailableOutgoingBitrate: 6_000_000,
      maxIncomingBitrate: 50_000_000,
      // Gigabit-friendly: generous SCTP buffers for chat/files/whiteboard.
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      enableSctp: true,
      maxSctpMessageSize: 262_144, // 256 KB per message (chunks are 60 KB)
    },
  },
};
