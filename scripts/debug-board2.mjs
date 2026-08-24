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
const ROOM = "debug-room7-aaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(2000);

await a.locator('button[title="Chat"]').click();
await a.getByPlaceholder("Write a message…").fill("Hi everyone!");
await a.keyboard.press("Enter");
await b.locator('button[title="Chat"]').click();
await b.getByPlaceholder("Write a message…").fill("Bonjour Alice !");
await b.keyboard.press("Enter");
await a.waitForTimeout(500);
await a.screenshot({ path: "docs/screenshots/room.png" });

await a.locator('button[title="Whiteboard"]').click();
await a.waitForTimeout(600);
const canvas = a.locator(".board-canvas");
const box = await canvas.boundingBox();
console.log("box:", JSON.stringify(box));
async function stroke(f, t) {
  await a.mouse.move(box.x + f[0] * box.width, box.y + f[1] * box.height);
  await a.mouse.down();
  for (let i = 1; i <= 18; i++) {
    await a.mouse.move(box.x + (f[0] + (t[0] - f[0]) * i / 18) * box.width, box.y + (f[1] + (t[1] - f[1]) * i / 18) * box.height, { steps: 2 });
  }
  await a.mouse.up();
  await a.waitForTimeout(120);
}
await stroke([0.12, 0.62], [0.38, 0.3]);
const probe1 = await a.evaluate(() => {
  const c = document.querySelector(".board-canvas");
  const ctx2 = c.getContext("2d");
  const x = Math.round(0.25 * c.width), y = Math.round(0.46 * c.height);
  const d = ctx2.getImageData(x, y, 1, 1).data;
  return { px: [d[0], d[1], d[2]], h: window.__board.history.length, boxH: c.height };
});
console.log("after stroke1:", JSON.stringify(probe1));
await a.locator(".swatch").nth(2).click();
await stroke([0.4, 0.32], [0.64, 0.66]);
await a.locator(".swatch").nth(4).click();
await stroke([0.55, 0.25], [0.85, 0.55]);
await stroke([0.85, 0.55], [0.6, 0.72]);
await a.waitForTimeout(900);
const probe2 = await a.evaluate(() => {
  const c = document.querySelector(".board-canvas");
  const ctx2 = c.getContext("2d");
  const x = Math.round(0.25 * c.width), y = Math.round(0.46 * c.height);
  const d = ctx2.getImageData(x, y, 1, 1).data;
  return { px: [d[0], d[1], d[2]], h: window.__board.history.length, boxH: c.height };
});
console.log("before shot:", JSON.stringify(probe2));
await a.screenshot({ path: "docs/screenshots/whiteboard.png" });
await browser.close();
