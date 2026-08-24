// Captures feature screenshots for the README by driving the real app.
// Usage: node scripts/screenshots.mjs   (server on :9090, web on :5173)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5173";
const ROOM = "screenshot-room-aaaaaaaaaaaaaa";
const OUT = "docs/screenshots";

const ARGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    locale: "en-US",
    permissions: ["microphone", "camera"],
    ...opts,
  });
  return ctx;
}

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ARGS });

try {
  // ---------- Landing (light + dark) ----------
  {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(400);
    await page.screenshot({ path: `${OUT}/landing-light.png` });

    await page.evaluate(() => localStorage.setItem("visio:theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });
    await sleep(500);
    await page.screenshot({ path: `${OUT}/landing-dark.png` });
    await ctx.close();
  }

  // ---------- Two participants in a room ----------
  const ctxA = await newContext(browser);
  const ctxB = await newContext(browser);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // Pre-join screen (Alice)
  await a.goto(`${BASE}/j/${ROOM}`, { waitUntil: "networkidle" });
  await sleep(1200); // fake camera preview
  await a.screenshot({ path: `${OUT}/prejoin.png` });

  await a.getByPlaceholder("Your name").fill("Alice");
  await a.getByRole("button", { name: "Join room" }).click();
  await a.waitForSelector(".grid .tile", { timeout: 15000 });

  await b.goto(`${BASE}/j/${ROOM}`, { waitUntil: "networkidle" });
  await b.getByPlaceholder("Your name").fill("Bob");
  await b.getByRole("button", { name: "Join room" }).click();
  await b.waitForSelector(".grid .tile", { timeout: 15000 });

  // Wait until Alice sees Bob's tile (2 tiles)
  await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
  await sleep(2500); // let frames settle

  // ---------- Chat with messages ----------
  await a.locator('button[title="Chat"]').click();
  await a.getByPlaceholder("Write a message…").fill("Hi everyone! 👋".replace("👋", "") || "Hi everyone!");
  await a.keyboard.press("Enter");
  await b.locator('button[title="Chat"]').click();
  await b.getByPlaceholder("Write a message…").fill("Bonjour Alice !");
  await b.keyboard.press("Enter");
  await sleep(800);

  // ---------- Room screenshot (Alice view + chat open) ----------
  await a.screenshot({ path: `${OUT}/room.png` });

  // ---------- Network panel (Bob view) ----------
  await b.locator('button[title="Network diagnostics"]').click();
  await b.waitForSelector(".hop-row", { timeout: 30000 });
  await sleep(3500); // RTT sparkline samples
  await b.screenshot({ path: `${OUT}/network.png` });

  // ---------- Whiteboard (Alice draws) ----------
  await a.locator('button[title="Whiteboard"]').click();
  await sleep(600); // let the canvas settle (initial ResizeObserver pass)
  const canvas = a.locator(".board-canvas");
  const box = await canvas.boundingBox();

  async function stroke(from, to, steps = 18) {
    await a.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
    await a.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await a.mouse.move(
        box.x + (from[0] + (to[0] - from[0]) * t) * box.width,
        box.y + (from[1] + (to[1] - from[1]) * t) * box.height,
        { steps: 2 }
      );
    }
    await a.mouse.up();
    await sleep(120);
  }

  // Keep strokes clear of the chat panel overlay on the left.
  await stroke([0.34, 0.62], [0.58, 0.30]);           // terracotta slash
  await a.locator(".swatch").nth(2).click();          // slate blue
  await stroke([0.60, 0.32], [0.80, 0.62]);
  await a.locator(".swatch").nth(4).click();          // cream
  await stroke([0.68, 0.22], [0.92, 0.48]);
  await stroke([0.92, 0.48], [0.72, 0.66]);

  // Let remote ops flush and take the shot of the board
  await sleep(900);
  await a.screenshot({ path: `${OUT}/whiteboard.png` });

  console.log("screenshots written to", OUT);
} finally {
  await browser.close();
}
