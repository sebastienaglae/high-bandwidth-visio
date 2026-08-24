// E2E: Prometheus metrics populate with a live room; a file transferred via
// the chat panel arrives as a download chip with progress.
import { chromium } from "playwright";
import WebSocket from "ws";

const ROOM = `ux-room-${Date.now().toString(36)}aaaaaaaaaa`.slice(0, 40);

// --- 1. Metrics with a live room (raw WS + HTTP) ---
const ws = new WebSocket("ws://127.0.0.1:9090/ws");
await new Promise((r) => ws.on("open", r));
ws.send(JSON.stringify({ type: "join", requestId: 1, roomId: ROOM, displayName: "Probe" }));
await new Promise((r) => ws.on("message", function h(raw) {
  if (JSON.parse(String(raw)).type === "response") { ws.off("message", h); r(); }
}));
const metrics = await (await fetch("http://127.0.0.1:9090/metrics")).text();
console.log("metrics live room:", metrics.includes("visio_rooms 1") ? "ok" : "FAIL");
console.log("metrics per-room label:", metrics.includes(`room="${ROOM}"`) ? "ok" : "FAIL");
ws.close();

// --- 2. Browser file transfer with progress ---
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
async function join(name) {
  const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5173/j/${ROOM}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile", { timeout: 15000 });
  return p;
}
const a = await join("Alice");
const b = await join("Bob");
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(2000);

// Bob opens chat and attaches a file.
await b.locator('button[title="Chat"]').click();
await b.locator('button[title="Share a file (temporary)"]').click();
const payload = Buffer.alloc(1024 * 1024, 7);
await b.setInputFiles('input[type="file"]', {
  name: "e2e-payload.bin",
  mimeType: "application/octet-stream",
  buffer: payload,
});

// Progress row appears for the sender.
await b.waitForSelector(".transfer", { timeout: 10000 });
console.log("sender progress row: ok");

// Alice opens chat and waits for the download chip.
await a.locator('button[title="Chat"]').click();
await a.waitForSelector(".file-chip", { timeout: 20000 });
const chipText = await a.locator(".file-chip").first().textContent();
console.log(
  "receiver download chip:",
  chipText?.includes("e2e-payload.bin") && chipText.includes("1.0 MB") ? "ok" : `FAIL (${chipText})`
);

await browser.close();
console.log("done");
process.exit(0);
