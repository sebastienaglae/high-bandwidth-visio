// Captures feature screenshots for the README by driving the real app.
// Usage: node scripts/screenshots.mjs   (server on :9090, web on :5173)

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.VISIO_SCREENSHOT_BASE ?? "http://127.0.0.1:5173";
const ROOM = "screenshot-room-aaaaaaaaaaaaaa";
const OUT = "docs/screenshots";

const ARGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function auditA11y(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  if (blocking.length) {
    throw new Error(`${label} accessibility violations:\n${blocking.map((violation) =>
      `${violation.impact} ${violation.id}: ${violation.help}\n${violation.nodes.map((node) => `  ${node.target.join(" ")} — ${node.failureSummary}`).join("\n")}`
    ).join("\n")}`);
  }
}

async function newContext(browser, opts = {}, skipOnboarding = true) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    locale: "en-US",
    permissions: ["microphone", "camera"],
    ...opts,
  });
  if (skipOnboarding) await ctx.addInitScript(() => localStorage.setItem("visio:onboarding", "done"));
  return ctx;
}

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ARGS });

try {
  // ---------- First-run onboarding ----------
  {
    const ctx = await newContext(browser, {}, false);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.getByRole("dialog", { name: "Meet without the noise" }).waitFor();
    await auditA11y(page, "onboarding");
    await page.evaluate(() => document.activeElement?.blur());
    await page.screenshot({ path: `${OUT}/onboarding.png` });
    await ctx.close();
  }

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
  await a.goto(`${BASE}/j/${ROOM}?debug`, { waitUntil: "networkidle" });
  await sleep(1200); // fake camera preview
  // README captures use the product's intentional camera-off treatment rather
  // than Chromium's fluorescent synthetic camera feed.
  await a.locator('button[title="Toggle camera"]').click();
  await a.getByPlaceholder("Your name").fill("Alice");
  await sleep(350);
  await a.evaluate(() => document.activeElement?.blur());
  await a.screenshot({ path: `${OUT}/prejoin.png` });

  await a.getByPlaceholder("Your name").fill("Alice");
  await a.getByRole("button", { name: "Join room" }).click();
  await a.waitForSelector(".grid .tile", { timeout: 15000 });
  await a.locator('button[title="Camera"]').click();

  // ---------- Empty room (self only) ----------
  await sleep(500);
  await auditA11y(a, "empty room");
  await a.screenshot({ path: `${OUT}/room-empty.png` });

  await b.goto(`${BASE}/j/${ROOM}`, { waitUntil: "networkidle" });
  await b.getByPlaceholder("Your name").fill("Bob");
  await b.getByRole("button", { name: "Join room" }).click();
  await b.waitForSelector(".grid .tile", { timeout: 15000 });
  await b.locator('button[title="Camera"]').click();

  // Wait until Alice sees Bob's tile (2 tiles)
  await a.waitForFunction(() => document.querySelectorAll(".grid .tile").length >= 2, null, { timeout: 15000 });
  await sleep(2500); // let frames settle
  await a.locator(".grid .tile").evaluateAll((tiles) => tiles.forEach((tile) => tile.classList.add("camera-disabled")));
  await b.locator(".grid .tile").evaluateAll((tiles) => tiles.forEach((tile) => tile.classList.add("camera-disabled")));

  // ---------- Signaling reconnect state ----------
  await a.evaluate(() => window.__room?.signal.onConnectionLost?.());
  await a.locator(".reconnect-banner").waitFor({ state: "visible" });
  await auditA11y(a, "reconnecting room");
  await a.screenshot({ path: `${OUT}/room-reconnecting.png` });
  await a.evaluate(() => window.__room?.signal.onRestored?.());
  await a.locator(".reconnect-banner.hidden").waitFor({ state: "attached" });

  // ---------- Locked-room join failure ----------
  const lockButton = a.locator('button[title="Lock the room"]');
  await lockButton.click();
  await sleep(300);
  const ctxLocked = await newContext(browser);
  const locked = await ctxLocked.newPage();
  await locked.goto(`${BASE}/j/${ROOM}`, { waitUntil: "networkidle" });
  await locked.getByPlaceholder("Your name").fill("Charlie");
  await locked.getByRole("button", { name: "Join room" }).click();
  await locked.locator(".error-state").waitFor({ state: "visible", timeout: 15000 });
  await auditA11y(locked, "locked room join failure");
  await locked.screenshot({ path: `${OUT}/join-failure.png` });
  await ctxLocked.close();
  await a.locator('button[title="Unlock the room"]').click();

  // ---------- Chat with messages ----------
  await a.locator('button[title="Keyboard shortcuts"]').click();
  await a.locator(".shortcuts-dialog").waitFor({ state: "visible" });
  if (await a.evaluate(() => document.activeElement?.textContent?.trim()) !== "Close") {
    throw new Error("shortcuts dialog did not receive initial focus");
  }
  await a.keyboard.press("Escape");
  await a.locator(".shortcuts-dialog").waitFor({ state: "detached" });
  if (await a.evaluate(() => document.activeElement?.getAttribute("title")) !== "Keyboard shortcuts") {
    throw new Error("shortcuts dialog did not restore focus");
  }

  await a.locator('button[title="Chat"]').click();
  if (await a.evaluate(() => document.activeElement?.tagName) !== "TEXTAREA") {
    throw new Error("chat panel did not focus its composer");
  }
  await a.locator(".chat-panel .panel-close").focus();
  await a.keyboard.press("Shift+Tab");
  if (await a.evaluate(() => document.activeElement?.getAttribute("aria-label")) !== "Send") {
    throw new Error("chat panel did not trap reverse focus");
  }
  await a.getByPlaceholder("Write a message…").fill("Hi everyone! 👋".replace("👋", "") || "Hi everyone!");
  await a.keyboard.press("Enter");
  await b.locator('button[title="Chat"]').click();
  await b.getByPlaceholder("Write a message…").fill("Bonjour Alice !");
  await b.keyboard.press("Enter");
  await sleep(800);
  await a.locator(".chat-messages .msg.system").evaluateAll((messages) => messages.forEach((message) => message.remove()));

  // ---------- Room screenshot (Alice view + chat open) ----------
  await auditA11y(a, "room with chat");
  await a.screenshot({ path: `${OUT}/room.png` });

  // ---------- Mobile room + full-height chat sheet ----------
  await a.setViewportSize({ width: 390, height: 844 });
  await sleep(350);
  const mobileOverflow = await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (mobileOverflow > 1) throw new Error(`mobile room has ${mobileOverflow}px horizontal overflow`);
  await auditA11y(a, "mobile room with chat");
  await a.screenshot({ path: `${OUT}/room-mobile.png` });
  await a.locator(".chat-panel .panel-close").click();
  await sleep(200);
  await auditA11y(a, "mobile media stage");
  await a.screenshot({ path: `${OUT}/room-mobile-stage.png` });
  await a.locator('button[title="More actions"]').click();
  await a.locator(".mobile-actions").waitFor({ state: "visible" });
  await auditA11y(a, "mobile actions menu");
  await a.screenshot({ path: `${OUT}/room-mobile-actions.png` });
  await a.keyboard.press("Escape");
  await a.locator(".mobile-actions").waitFor({ state: "hidden" });
  await a.setViewportSize({ width: 1440, height: 860 });
  await sleep(350);

  // ---------- Network panel (Bob view) ----------
  await b.locator('button[title="Network diagnostics"]').click();
  await b.waitForSelector(".hop-row", { timeout: 30000 });
  await sleep(3500); // RTT sparkline samples
  await auditA11y(b, "network panel");
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
  await a.getByRole("button", { name: "Brush" }).click();
  await a.locator(".swatch").nth(2).click();          // slate blue
  await stroke([0.60, 0.32], [0.80, 0.62]);
  await a.getByRole("button", { name: "Highlighter" }).click();
  await a.locator(".swatch").nth(3).click();          // olive highlight
  await stroke([0.38, 0.72], [0.82, 0.72]);
  await a.getByRole("button", { name: "Pen", exact: true }).click();
  await a.locator(".swatch").nth(4).click();          // cream
  await stroke([0.68, 0.22], [0.92, 0.48]);
  await stroke([0.92, 0.48], [0.72, 0.66]);
  await a.getByRole("button", { name: "Rectangle" }).click();
  await a.locator(".swatch").nth(1).click();
  await stroke([0.38, 0.24], [0.55, 0.44], 8);

  // Let remote ops flush and take the shot of the board
  await sleep(900);
  await auditA11y(a, "whiteboard");
  await a.screenshot({ path: `${OUT}/whiteboard.png` });

  console.log("screenshots written to", OUT);
} finally {
  await browser.close();
}
