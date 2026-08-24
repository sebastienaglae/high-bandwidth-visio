// E2E: wbUndo removes a stroke from server history and other clients replay.
import WebSocket from "ws";

const ROOM = `undo-room-${Date.now().toString(36)}aaaaaaaaa`.slice(0, 40);

function client() {
  const ws = new WebSocket("ws://127.0.0.1:9090/ws");
  const state = { pushes: [], id: 0, joined: null };
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
await a.req("join", { roomId: ROOM, displayName: "A" });
await b.req("join", { roomId: ROOM, displayName: "B" });

// Alice draws a stroke, Bob draws another.
await a.req("wbOp", { ops: [{ k: "start", s: { id: "a1", color: "#d97757", width: 4 }, pts: [0.1, 0.1, 0.2, 0.2] }] });
await b.req("wbOp", { ops: [{ k: "start", s: { id: "b1", color: "#5b7a9d", width: 4 }, pts: [0.3, 0.3, 0.4, 0.4] }] });
await new Promise((r) => setTimeout(r, 200));

// Alice undoes her stroke. Bob cannot undo Alice's.
await a.req("wbUndo", { id: "a1" });
try {
  await b.req("wbUndo", { id: "a1" });
  console.log("foreign undo rejected: FAIL");
} catch {
  console.log("foreign undo rejected: ok");
}
await new Promise((r) => setTimeout(r, 200));

// Late joiner's snapshot must contain only Bob's stroke.
const c = await client();
const jc = await c.req("join", { roomId: ROOM, displayName: "C" });
const ids = (jc.wbOps ?? []).filter((o) => o.k === "start").map((o) => o.s.id);
console.log("snapshot after undo:", ids.length === 1 && ids[0] === "b1" ? "ok" : `FAIL (${JSON.stringify(ids)})`);

// Bob received the wbUndo push.
console.log(
  "undo pushed to peers:",
  b.state.pushes.some((p) => p.type === "wbUndo" && p.id === "a1") ? "ok" : "FAIL"
);

a.ws.close(); b.ws.close(); c.ws.close();
process.exit(0);
