// E2E: force-drop a participant's signaling socket and verify the session
// resumes with the same identity, without peers seeing a leave/join.
import WebSocket from "ws";

const ROOM = `resume-room-${Date.now().toString(36)}aaaaaaaaaa`.slice(0, 40);

function client() {
  const ws = new WebSocket("ws://127.0.0.1:9090/ws");
  const state = { pushes: [], id: 0 };
  const pending = new Map();
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "response" || m.type === "error") {
      if (pending.has(m.requestId)) {
        const { res, rej } = pending.get(m.requestId);
        pending.delete(m.requestId);
        if (m.type === "error") rej(new Error(m.message));
        else res(m.data);
      }
    } else {
      state.pushes.push(m);
    }
  });
  return new Promise((resolve) => {
    ws.on("open", () =>
      resolve({
        ws,
        state,
        req: (type, payload = {}) =>
          new Promise((res, rej) => {
            const i = ++state.id;
            pending.set(i, { res, rej });
            ws.send(JSON.stringify({ type, requestId: i, ...payload }));
          }),
      })
    );
  });
}

const a = await client();
const b = await client();

const ja = await a.req("join", { roomId: ROOM, displayName: "Alice" });
await b.req("join", { roomId: ROOM, displayName: "Bob" });
console.log("alice peerId:", ja.peerId);

// Alice's socket drops (simulated network cut).
a.ws.close();
await new Promise((r) => setTimeout(r, 500));

// Bob must NOT see a peerLeft during the grace window.
const bobSawLeave = b.state.pushes.some((p) => p.type === "peerLeft");
console.log("no peerLeft during grace:", !bobSawLeave ? "ok" : "FAIL");

// Alice reconnects and resumes.
const a2 = await client();
const jr = await a2.req("resume", { peerId: ja.peerId });
console.log("resumed, same roomId:", jr.roomId === ROOM ? "ok" : "FAIL");

await new Promise((r) => setTimeout(r, 300));
const bobSawRejoin = b.state.pushes.some(
  (p) => p.type === "newPeer" || p.type === "peerLeft"
);
console.log("no leave/join churn for Bob:", !bobSawRejoin ? "ok" : "FAIL");

// Resumed session can still signal (wb op goes through).
await a2.req("wbOp", { ops: [{ k: "start", s: { id: "s9", color: "#d97757", width: 4 }, pts: [0.1, 0.1] }] });
await new Promise((r) => setTimeout(r, 200));
const bobGotWb = b.state.pushes.some((p) => p.type === "wbOps");
console.log("resumed peer can publish:", bobGotWb ? "ok" : "FAIL");

// Unknown session must be rejected.
try {
  const c = await client();
  await c.req("resume", { peerId: "peer-does-not-exist" });
  console.log("unknown resume rejected: FAIL");
} catch {
  console.log("unknown resume rejected: ok");
}

a.ws.close(); a2.ws.close(); b.ws.close();
process.exit(0);
