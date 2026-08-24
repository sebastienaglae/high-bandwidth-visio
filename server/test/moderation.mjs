// E2E: host election, mute/kick/lock moderation, host migration.
import WebSocket from "ws";

const ROOM = `mod-room-${Date.now().toString(36)}aaaaaaaaaa`.slice(0, 40);

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

const results = [];
const check = (name, ok) => results.push([name, ok]);

// --- Host election ---
const host = await client();
const jh = await host.req("join", { roomId: ROOM, displayName: "Host" });
check("first peer is host", jh.role === "host");

const guest1 = await client();
const j1 = await guest1.req("join", { roomId: ROOM, displayName: "G1" });
check("second peer is guest", j1.role === "guest");

// --- Mute ---
try {
  await host.req("moderate", { action: "mute", targetPeerId: j1.peerId });
} catch (e) {
  console.log("[dbg] mute threw:", e.message);
}
await new Promise((r) => setTimeout(r, 200));
check(
  "guest notified of mute",
  guest1.state.pushes.some((p) => p.type === "moderated" && p.targetPeerId === j1.peerId)
);

// Guest cannot moderate
let rejected = false;
try {
  await guest1.req("moderate", { action: "kick", targetPeerId: jh.peerId });
} catch {
  rejected = true;
}
check("guest moderation rejected", rejected);

console.log("step: mute done");
// --- Kick ---
const guest2 = await client();
const j2 = await guest2.req("join", { roomId: ROOM, displayName: "G2" });
await host.req("moderate", { action: "kick", targetPeerId: j2.peerId });
await new Promise((r) => setTimeout(r, 300));
check("kicked peer notified", guest2.state.pushes.some((p) => p.type === "kicked"));
check("others see peerLeft", host.state.pushes.some((p) => p.type === "peerLeft" && p.peerId === j2.peerId));

console.log("step: kick done");
// --- Lock ---
await host.req("moderate", { action: "lock" });
const guest3 = await client();
try {
  await guest3.req("join", { roomId: ROOM, displayName: "G3" });
  check("locked room rejects join", false);
} catch (e) {
  check("locked room rejects join", /locked/.test(e.message));
}

console.log("step: lock done");
// --- Host migration on leave ---
host.ws.close();
await new Promise((r) => setTimeout(r, 300));
check(
  "host migrated to remaining peer",
  guest1.state.pushes.some((p) => p.type === "roleChanged" && p.role === "host")
);

// New host can now moderate
await guest1.req("moderate", { action: "unlock" });
const guest4 = await client();
const j4 = await guest4.req("join", { roomId: ROOM, displayName: "G4" });
check("new host unlocked room", !!j4.peerId);

let pass = 0;
for (const [name, ok] of results) {
  console.log(ok ? "ok  " : "FAIL", "-", name);
  if (ok) pass++;
}
console.log(`${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);

