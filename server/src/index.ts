import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { handleConnection } from "./signaling.js";
import { randomRoomToken } from "./ids.js";
import { RateLimiter } from "./ratelimit.js";

// ---- Boot validation ----
if (config.isProd && config.listenIp === "0.0.0.0" && !config.announcedIp) {
  console.error(
    "[visio] FATAL: production with LISTEN_IP=0.0.0.0 requires ANNOUNCED_IP " +
      "(the public IPv4 WebRTC clients must reach)."
  );
  process.exit(1);
}

const speedtestLimiter = new RateLimiter(1, 1000 / config.limits.speedtestCooldownMs);
const httpLimiter = new RateLimiter(30, 5); // general HTTP: bursts of 30, ~5/s refill
setInterval(() => {
  speedtestLimiter.sweep();
  httpLimiter.sweep();
}, 60_000).unref();

const server = http.createServer((req, res) => {
  // Baseline security headers for everything served.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (config.isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Frame-Options", "DENY");
  }

  const ip =
    (config.trustProxy && typeof req.headers["x-forwarded-for"] === "string"
      ? (req.headers["x-forwarded-for"] as string).split(",")[0].trim()
      : req.socket.remoteAddress?.replace(/^::ffff:/, "")) ?? "unknown";

  if (!httpLimiter.allow(`http:${ip}`)) {
    res.writeHead(429).end();
    return;
  }

  // Health + room-link helper endpoints.
  if (req.url === "/healthz") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/api/new-room") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ roomId: randomRoomToken() }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/speedtest")) {
    if (!speedtestLimiter.allow(`speed:${ip}`)) {
      res.writeHead(429).end("slow down");
      return;
    }
    const requested = Number(new URL(req.url, "http://x").searchParams.get("bytes") ?? 32_000_000);
    const bytes = Math.max(config.limits.minSpeedtestBytes, Math.min(requested, config.limits.maxSpeedtestBytes));
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(bytes),
      "cache-control": "no-store",
    });
    const chunk = Buffer.alloc(64 * 1024);
    let written = 0;
    let aborted = false;
    req.on("aborted", () => (aborted = true));
    const pump = (): boolean => {
      while (!aborted && written < bytes) {
        const n = Math.min(chunk.length, bytes - written);
        written += n;
        if (!res.write(written >= bytes ? chunk.subarray(0, n) : chunk)) return false;
      }
      res.end();
      return true;
    };
    res.on("drain", () => pump());
    pump();
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket: WebSocket, req: http.IncomingMessage) => {
  const fwd = req.headers["x-forwarded-for"];
  const clientIp =
    (config.trustProxy && typeof fwd === "string" ? fwd.split(",")[0].trim() : undefined) ??
    req.socket.remoteAddress ??
    "0.0.0.0";
  handleConnection(socket, clientIp.replace(/^::ffff:/, ""));
});

server.listen(config.port, config.listenIp, () => {
  console.log(
    `[visio] signaling listening on ${config.listenIp}:${config.port} ` +
      `(${config.isProd ? "production" : "development"})`
  );
  console.log(
    `[sfu] listen ip: ${config.listenIp}, announced: ${config.announcedIp ?? "(auto)"}, ` +
      `rtc ports ${config.rtcMinPort}-${config.rtcMaxPort}`
  );
});

// ---- Graceful shutdown ----
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[visio] ${signal} received, closing...`);
  for (const client of wss.clients) client.close(1001, "server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
