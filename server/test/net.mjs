import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:9090/ws");
let id = 0;
const pending = new Map();

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type === "welcome") console.log("welcome: clientIp =", msg.clientIp);
  else if (msg.type === "response" && pending.has(msg.requestId)) {
    pending.get(msg.requestId)(msg.data);
    pending.delete(msg.requestId);
  }
});

await new Promise((r) => ws.on("open", r));

function req(type, payload = {}) {
  return new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ type, requestId: i, ...payload }));
  });
}

await req("join", { roomId: "nettest-room-aaaaaaaaaaaaaaaa", displayName: "NetBot" });
console.log("joined");

const t0 = Date.now();
const data = await req("traceroute", { target: "1.1.1.1" });
console.log("trace took", ((Date.now() - t0) / 1000).toFixed(1) + "s,", data.hops.length, "hops, hash:", data.pathHash);
for (const h of data.hops.slice(0, 10)) {
  const rtt = h.rttMs != null ? h.rttMs.toFixed(1).padStart(8) + "ms" : "       -";
  console.log(`  #${String(h.hop).padEnd(2)}`, (h.ip ?? "*").padEnd(16), rtt, h.org ?? "", h.country ?? "");
}

// Second trace should be fast (GeoIP cache) and stable (no change)
const t1 = Date.now();
const data2 = await req("traceroute", { target: "1.1.1.1" });
console.log("second trace took", ((Date.now() - t1) / 1000).toFixed(1) + "s, changed:", !!data2.changed);

// ping RTT
for (let i = 0; i < 3; i++) {
  const s = Date.now();
  await req("ping");
  console.log("ws rtt:", Date.now() - s, "ms");
}

process.exit(0);
