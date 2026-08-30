import WebSocket from "ws";

const base = (process.env.VISIO_BASE_URL ?? "http://127.0.0.1").replace(/\/+$/, "");
const requireTurn = process.env.REQUIRE_TURN === "1";
const skipEdge = process.env.VISIO_SKIP_EDGE === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) });
  assert(response.ok, `${path} returned ${response.status}`);
  return response;
}

if (!skipEdge) {
  const home = await get("/");
  assert(home.headers.get("content-security-policy")?.includes("default-src 'self'"), "CSP header is missing");
  assert(home.headers.get("permissions-policy")?.includes("camera=(self)"), "Permissions-Policy header is missing");
  assert(home.headers.get("x-content-type-options") === "nosniff", "nosniff header is missing");
  if (base.startsWith("https://")) {
    assert(home.headers.has("strict-transport-security"), "HSTS header is missing on HTTPS");
  }
}

const room = await (await get("/api/new-room")).json();
assert(typeof room.roomId === "string" && /^[A-Za-z0-9_-]{20,}$/.test(room.roomId), "room token is malformed");

const rtc = await (await get("/api/rtc-config")).json();
assert(Array.isArray(rtc.iceServers), "RTC config is malformed");
if (requireTurn) assert(rtc.iceServers.some((server) => JSON.stringify(server.urls).includes("turn:")), "TURN is required but not advertised");

const wsUrl = `${base.replace(/^http/, "ws")}/ws`;
await new Promise((resolve, reject) => {
  const socket = new WebSocket(wsUrl, { handshakeTimeout: 10_000 });
  const timeout = setTimeout(() => { socket.terminate(); reject(new Error("WebSocket smoke timed out")); }, 12_000);
  socket.once("open", () => socket.close(1000));
  socket.once("close", () => { clearTimeout(timeout); resolve(); });
  socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
});

console.log(`Production smoke passed for ${base}${requireTurn ? " with TURN" : ""}`);
