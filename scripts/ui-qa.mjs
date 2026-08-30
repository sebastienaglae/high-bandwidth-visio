// Deterministic cross-viewport UI QA for entry surfaces.
// Starts Vite, captures production reference images, and enforces basic
// responsive/accessibility invariants. No signaling server is required.

import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const BASE = "http://127.0.0.1:4173";
const OUT = join(ROOT, "docs", "screenshots", "qa");
const ROOM = "qa-room-aaaaaaaaaaaaaaaa";
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};
const LANGS = ["en", "fr", "ja"];

mkdirSync(OUT, { recursive: true });

const isWindows = process.platform === "win32";
const vite = spawn(
  isWindows ? "cmd.exe" : "npm",
  isWindows
    ? ["/d", "/s", "/c", "npm run dev -w web -- --host 127.0.0.1 --port 4173 --strictPort"]
    : ["run", "dev", "-w", "web", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
);

let serverOutput = "";
vite.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
vite.stderr.on("data", (chunk) => { serverOutput += String(chunk); });

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early:\n${serverOutput}`);
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for Vite:\n${serverOutput}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function audit(page, label, mobile) {
  const result = await page.evaluate(({ mobile }) => {
    const root = document.documentElement;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const unlabeled = [...document.querySelectorAll("button, input, textarea, select")]
      .filter(visible)
      .filter((element) => {
        if (element instanceof HTMLInputElement && element.type === "hidden") return false;
        const id = element.id;
        const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        return !explicit && !element.getAttribute("aria-label") && !element.getAttribute("title") && !element.textContent?.trim();
      })
      .map((element) => element.outerHTML.slice(0, 160));
    const smallTargets = mobile
      ? [...document.querySelectorAll("button, a, select, input")]
          .filter(visible)
          .map((element) => ({ html: element.outerHTML.slice(0, 120), box: element.getBoundingClientRect() }))
          .filter(({ html, box }) => {
            if (/type="(?:checkbox|radio)"/.test(html)) return false;
            return box.width < 40 || box.height < 40;
          })
          .map(({ html, box }) => `${Math.round(box.width)}x${Math.round(box.height)} ${html}`)
      : [];
    return {
      overflow: root.scrollWidth - root.clientWidth,
      unlabeled,
      smallTargets,
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      lang: root.lang,
    };
  }, { mobile });

  assert(result.overflow <= 1, `${label}: horizontal overflow of ${result.overflow}px`);
  assert(result.unlabeled.length === 0, `${label}: unlabeled controls:\n${result.unlabeled.join("\n")}`);
  assert(result.smallTargets.length === 0, `${label}: undersized mobile targets:\n${result.smallTargets.join("\n")}`);
  assert(result.title.length > 0, `${label}: missing page heading`);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  assert(
    blocking.length === 0,
    `${label}: axe accessibility violations:\n${blocking.map((violation) =>
      `${violation.impact} ${violation.id}: ${violation.help}\n${violation.nodes.map((node) => `  ${node.target.join(" ")} — ${node.failureSummary}`).join("\n")}`
    ).join("\n")}`
  );
  return result;
}

async function configure(page, lang, theme) {
  await page.addInitScript(({ lang, theme }) => {
    localStorage.setItem("visio:lang", lang);
    localStorage.setItem("visio:theme", theme);
  }, { lang, theme });
}

await waitForServer();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const lang of LANGS) {
      const themes = viewportName === "tablet" ? ["light"] : ["light", "dark"];
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport,
          locale: lang === "ja" ? "ja-JP" : `${lang}-${lang === "en" ? "US" : "FR"}`,
          permissions: ["camera", "microphone"],
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await configure(page, lang, theme);
        await page.goto(BASE, { waitUntil: "networkidle" });
        const label = `landing-${viewportName}-${lang}-${theme}`;
        const result = await audit(page, label, viewportName === "mobile");
        assert(result.lang === lang, `${label}: expected document language ${lang}, got ${result.lang}`);
        await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
        await context.close();
      }
    }
  }

  for (const viewportName of ["desktop", "mobile"]) {
    for (const lang of LANGS) {
      const context = await browser.newContext({
        viewport: VIEWPORTS[viewportName],
        locale: lang === "ja" ? "ja-JP" : `${lang}-${lang === "en" ? "US" : "FR"}`,
        permissions: ["camera", "microphone"],
      });
      const page = await context.newPage();
      await configure(page, lang, "light");
      await page.goto(`${BASE}/j/${ROOM}`, { waitUntil: "networkidle" });
      await page.locator(".prejoin-shell").waitFor({ state: "visible", timeout: 12_000 });
      const label = `prejoin-${viewportName}-${lang}-light`;
      await audit(page, label, viewportName === "mobile");
      await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
      await context.close();
    }
  }

  if (process.env.VISIO_CROSS_BROWSER === "1") {
    for (const [engineName, engine] of [["firefox", firefox], ["webkit", webkit]]) {
      const engineBrowser = await engine.launch({ headless: true });
      try {
        for (const [surface, path] of [["landing", "/"], ["prejoin", `/j/${ROOM}`]]) {
          const context = await engineBrowser.newContext({ viewport: VIEWPORTS.mobile, locale: "ja-JP" });
          const page = await context.newPage();
          await configure(page, "ja", "dark");
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "mediaDevices", {
              configurable: true,
              value: {
                enumerateDevices: () => Promise.resolve([]),
                getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
              },
            });
          });
          await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
          if (surface === "prejoin") await page.locator(".prejoin-shell").waitFor({ state: "visible", timeout: 12_000 });
          const label = `${surface}-mobile-ja-dark-${engineName}`;
          await audit(page, label, true);
          await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
          await context.close();
        }
      } finally {
        await engineBrowser.close();
      }
    }
  }

  console.log(`UI QA passed; screenshots written to ${OUT}`);
} finally {
  await browser.close();
  if (isWindows && vite.pid) {
    spawnSync("taskkill", ["/pid", String(vite.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else {
    vite.kill("SIGTERM");
  }
}
