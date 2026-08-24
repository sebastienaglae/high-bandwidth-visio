import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function join(name, room) {
  const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5173/j/${room}?debug`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile");
  return p;
}
const ROOM = "stats-room-aaaaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(6000);
const r = await a.evaluate(async () => {
  const room = window.__room;
  const recv = room["recvTransport"];
  const st = await recv.getStats();
  const isMap = st instanceof Map;
  const rows = [];
  if (isMap) {
    st.forEach((v, k) => {
      rows.push({ k: String(k).slice(0, 8), type: v.type, kind: v.kind, bytes: v.bytesReceived ?? v.bytesSent, rtt: v.currentRoundTripTime });
    });
  }
  return { isMap, size: isMap ? st.size : -1, rows: rows.slice(0, 12) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
