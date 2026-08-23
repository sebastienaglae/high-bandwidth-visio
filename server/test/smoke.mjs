import WebSocket from "ws";

const base = "http://127.0.0.1:9090";
const res = await fetch(`${base}/api/new-room`);
const { roomId } = await res.json();
console.log("room:", roomId, "len:", roomId.length);

const ws = new WebSocket(`ws://127.0.0.1:9090/ws`);
let id = 0;

await new Promise((r) => ws.on("open", r));

function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.requestId === requestId) {
        ws.off("message", onMsg);
        if (msg.type === "error") reject(new Error(msg.message));
        else resolve(msg.data);
      }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ type, requestId, ...payload }));
  });
}

ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type !== "response") console.log("push:", JSON.stringify(msg).slice(0, 120));
});

const joined = await request("join", { roomId, displayName: "TestBot" });
console.log(
  "joined as",
  joined.peerId,
  "| codecs:",
  joined.rtpCapabilities.codecs.map((c) => c.mimeType).join(", ")
);

const t1 = await request("createWebRtcTransport", { direction: "send" });
const t2 = await request("createWebRtcTransport", { direction: "recv" });
console.log("send transport:", t1.id, "| candidates:", t1.iceCandidates.length);
console.log("recv transport:", t2.id);

// Second client sees the first
const ws2 = new WebSocket(`ws://127.0.0.1:9090/ws`);
await new Promise((r) => ws2.on("open", r));
ws2.send(JSON.stringify({ type: "join", requestId: 1, roomId, displayName: "SecondBot" }));
await new Promise((resolve) => {
  ws2.on("message", function h(raw) {
    const msg = JSON.parse(String(raw));
    if (msg.type === "response") {
      console.log("client2 peers seen:", msg.data.peers.map((p) => p.displayName).join(", "));
      resolve();
      ws2.off("message", h);
    }
  });
});

// setConsumerPreferredLayers on a bogus id must return an error, not hang
try {
  await request("setConsumerPreferredLayers", { consumerId: "nope", spatialLayer: 2, temporalLayer: 2 });
  console.log("FAIL: expected error");
} catch {
  console.log("preferred-layers error path ok");
}

ws.close(); ws2.close();
process.exit(0);
