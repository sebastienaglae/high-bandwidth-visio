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
const ROOM = "debug-room9-aaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(2000);
await a.locator('button[title="Whiteboard"]').click();
await a.waitForTimeout(600);
const box = await a.locator(".board-canvas").boundingBox();
await a.mouse.move(box.x + 0.15 * box.width, box.y + 0.6 * box.height);
await a.mouse.down();
for (let i = 1; i <= 18; i++) {
  await a.mouse.move(box.x + (0.15 + (0.26 * i) / 18) * box.width, box.y + (0.6 - (0.32 * i) / 18) * box.height, { steps: 2 });
}
await a.mouse.up();
await a.waitForTimeout(400);
const r = await a.evaluate(() => {
  const boards = document.querySelectorAll(".board-canvas").length;
  const c = document.querySelector(".board-canvas");
  const ctx2 = c.getContext("2d");
  const px = ctx2.getImageData(Math.round(0.28 * c.width), Math.round(0.44 * c.height), 1, 1).data;
  return { boards, h: window.__board.history.length, px: [px[0], px[1], px[2]], cw: c.width, ch: c.height };
});
console.log(JSON.stringify(r));
await browser.close();
