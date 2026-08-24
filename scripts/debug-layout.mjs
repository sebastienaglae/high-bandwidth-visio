import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function join(name, room) {
  const ctx = await browser.newContext({ locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5173/j/${room}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile", { timeout: 15000 });
  return p;
}
const ROOM = "layout-room-aaaaaaaaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(2000);

// Switch Alice to speaker layout via the layout button.
await a.locator('button[title="Speaker view"]').click();
await a.waitForTimeout(500);
const dominant = await a.evaluate(() => document.querySelector(".tile.dominant .label")?.textContent);
console.log("dominant tile:", dominant);
await a.screenshot({ path: "docs/screenshots/layout-speaker.png" });

// Pin Bob's tile.
await b.locator('.pin-btn').first().click();
await a.waitForTimeout(300);
const dom2 = await a.evaluate(() => document.querySelector(".tile.dominant .label")?.textContent);
console.log("after pin (Bob pins himself, Alice sees own dominant):", dom2);

// Bob pins Alice instead: from Alice's perspective nothing changes; verify pinned class exists somewhere
const pinnedCount = await b.evaluate(() => document.querySelectorAll(".tile.pinned").length);
console.log("pinned tiles on Bob:", pinnedCount);
await browser.close();
