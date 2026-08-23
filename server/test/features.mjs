import WebSocket from "ws";

// Two-client integration test: data channels + whiteboard relay + snapshots.
const ws1 = new WebSocket("ws://127.0.0.1:9090/ws");
const ws2 = new WebSocket("ws://127.0.0.1:9090/ws");
let id = 0;
const pending = new Map();
const pushes2 = [];
const ROOM = `feat-room-${Date.now().toString(36)}aaaaaaaaaa`.slice(0, 40);

function wire(ws, tag) {
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if ((m.type === "response" || m.type === "error") && pending.has(m.requestId)) {
      const { res, rej } = pending.get(m.requestId);
      pending.delete(m.requestId);
      if (m.type === "error") rej(new Error(m.message));
      else res(m.data);
    } else if (!m.type.startsWith("wel")) {
      if (tag === 2) pushes2.push(m);
    }
  });
}
await new Promise((r) => ws1.on("open", r));
await new Promise((r) => ws2.on("open", r));
wire(ws1, 1);
wire(ws2, 2);

function req(ws, type, payload = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ type, requestId: i, ...payload }));
  });
}

const j1 = await req(ws1, "join", { roomId: ROOM, displayName: "Alice" });
console.log("alice joined, wbOps snapshot:", JSON.stringify(j1.wbOps));

// Alice publishes a data channel
const t1 = await req(ws1, "createWebRtcTransport", { direction: "send" });
const dp = await req(ws1, "produceData", { transportId: t1.id, label: "app", protocol: "visio-app-v1" });
console.log("data producer:", dp.id ? "ok" : "FAIL", "| label:", dp.label);

// Bob joins and must see it + receive wb snapshot later
const j2 = await req(ws2, "join", { roomId: ROOM, displayName: "Bob" });
console.log("bob sees dataProducers:", j2.dataProducers.length === 1 ? "ok" : "FAIL");

// Bob consumes the data channel
const t2 = await req(ws2, "createWebRtcTransport", { direction: "recv" });
const dc = await req(ws2, "consumeData", { dataProducerId: dp.id, transportId: t2.id });
console.log("bob consumeData:", dc.id && dc.peerId ? "ok" : "FAIL");

// Whiteboard ops from Bob are stored and broadcast (not echoed to Bob)
await req(ws2, "wbOp", { ops: [{ k: "start", s: { id: "s1", color: "#d97757", width: 4 }, pts: [0.1, 0.1, 0.2, 0.2] }] });
await new Promise((r) => setTimeout(r, 200));

// Alice reconnects as a third client -> snapshot must contain the stroke
const ws3 = new WebSocket("ws://127.0.0.1:9090/ws");
await new Promise((r) => ws3.on("open", r));
let id3 = 0;
const pending3 = new Map();
ws3.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if ((m.type === "response" || m.type === "error") && pending3.has(m.requestId)) {
    const { res, rej } = pending3.get(m.requestId);
    pending3.delete(m.requestId);
    if (m.type === "error") rej(new Error(m.message));
    else res(m.data);
  }
});
function req3(type, payload = {}) {
  return new Promise((res, rej) => {
    const i = ++id3;
    pending3.set(i, { res, rej });
    ws3.send(JSON.stringify({ type, requestId: i, ...payload }));
  });
}
let snap = null;
snap = await req3("join", { roomId: ROOM, displayName: "Carol" });
console.log(
  "wb snapshot replay:",
  Array.isArray(snap?.wbOps) && snap.wbOps.length === 1 ? "ok" : "FAIL"
);

// Invalid ops rejected
try {
  await req3("wbOp", { ops: [{ k: "start", s: { id: "x", color: "red", width: 4 }, pts: [0, 0] }] });
  console.log("wb validation: FAIL (accepted bad color)");
} catch {
  console.log("wb validation: ok");
}

// Bob should have received a wbOps push? No - he sent it (no echo). Check push isolation:
const gotOwnEcho = pushes2.some((p) => p.type === "wbOps");
console.log("no self-echo of wb ops:", !gotOwnEcho ? "ok" : "FAIL");

ws1.close(); ws2.close(); ws3.close();
process.exit(0);
