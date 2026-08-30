import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function join(name, room) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: "en-US", permissions: ["microphone", "camera"] });
  const p = await ctx.newPage();
  const base = process.env.VISIO_SCREENSHOT_BASE ?? "http://127.0.0.1:5173";
  await p.goto(`${base}/j/${room}`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Join room" }).click();
  await p.waitForSelector(".grid .tile", { timeout: 15000 });
  await p.locator('button[title="Camera"]').click();
  return p;
}
const ROOM = "layout-shot-room-aaaaaaaaaaaa";
const a = await join("Alice", ROOM);
await a.waitForTimeout(1500);
const b = await join("Bob", ROOM);
await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
await b.waitForTimeout(2500);
await a.locator(".grid .tile").evaluateAll((tiles) => tiles.forEach((tile) => tile.classList.add("camera-disabled")));

// Alice: speaker layout, pin Bob.
await a.locator('button[title="Speaker view"]').click();
await a.waitForTimeout(300);
// Pin Bob from Alice's view: find the tile whose label contains "Bob".
const tiles = a.locator(".tile");
const n = await tiles.count();
for (let i = 0; i < n; i++) {
  const txt = await tiles.nth(i).locator(".label-text").textContent();
  if (txt?.startsWith("Bob")) {
    await tiles.nth(i).locator(".pin-btn").click();
    break;
  }
}
await a.waitForTimeout(500);
const results = await new AxeBuilder({ page: a })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  .analyze();
const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
if (blocking.length) throw new Error(`speaker layout accessibility violations: ${blocking.map((violation) => violation.id).join(", ")}`);
await a.screenshot({ path: "docs/screenshots/layout-speaker.png" });
console.log("saved");
await browser.close();
