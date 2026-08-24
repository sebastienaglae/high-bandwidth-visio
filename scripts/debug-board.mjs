import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 150)); });
await page.goto("http://localhost:5173/j/debug-room6-aaaaaaaaaaaaaa?debug", { waitUntil: "networkidle" });
await page.getByPlaceholder("Your name").fill("Solo");
await page.getByRole("button", { name: "Join room" }).click();
await page.waitForSelector(".grid .tile");
await page.locator('button[title="Whiteboard"]').click();
await page.waitForTimeout(800);
const canvas = page.locator(".board-canvas");
const box = await canvas.boundingBox();
console.log("canvas box:", JSON.stringify(box));
async function stroke(f, t) {
  await page.mouse.move(box.x + f[0] * box.width, box.y + f[1] * box.height);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + (f[0] + (t[0] - f[0]) * i / 10) * box.width, box.y + (f[1] + (t[1] - f[1]) * i / 10) * box.height, { steps: 2 });
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
}
await stroke([0.15, 0.6], [0.4, 0.3]);
await page.waitForTimeout(300);
console.log("after stroke1:", JSON.stringify(await page.evaluate(() => ({ h: window.__board.history.map((o) => o.k), s: window.__board.strokes }))));
await stroke([0.45, 0.35], [0.6, 0.6]);
await page.waitForTimeout(300);
console.log("after stroke2:", JSON.stringify(await page.evaluate(() => ({ h: window.__board.history.map((o) => o.k), s: window.__board.strokes }))));
await browser.close();
