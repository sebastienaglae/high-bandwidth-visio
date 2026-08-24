import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function join(name, room) {
  const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5173/j/${room}?debug`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile", { timeout: 15000 });
  return p;
}
const ROOM = "layout-room2-aaaaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(2000);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(3000);
console.log("alice names:", JSON.stringify([...(await a.evaluate(() => [...window.__names.entries()]))]));
console.log("alice host:", await a.evaluate(() => window.__host()));
console.log("alice labels:", JSON.stringify(await a.evaluate(() => [...document.querySelectorAll(".label-text")].map((e) => e.textContent))));
console.log("bob names:", JSON.stringify([...(await b.evaluate(() => [...window.__names.entries()]))]));
console.log("bob labels:", JSON.stringify(await b.evaluate(() => [...document.querySelectorAll(".label-text")].map((e) => e.textContent))));
await browser.close();
