import type { RoomClient } from "./room.js";
import { t } from "./i18n.js";
import { apiUrl } from "./env.js";
import type { TraceResult, HopInfo } from "@visio/shared";

interface Sample {
  t: number;
  rttMs: number;
}

export class NetPanel {
  private root: HTMLElement;
  private log!: HTMLDivElement;
  private hopsBox!: HTMLDivElement;
  private pathSummary!: HTMLDivElement;
  private mediaStats!: HTMLDivElement;
  private connectionSummary!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private clientIp = "…";
  private samples: Sample[] = [];
  private timers: number[] = [];
  private watching = false;
  private lastRecvBytes = 0;
  private lastSendBytes = 0;
  private lastStatsT = 0;

  constructor(
    private client: RoomClient,
    private onClose: () => void
  ) {
    this.root = document.createElement("aside");
    this.root.className = "net-panel";
    this.root.setAttribute("aria-label", t("netTitle"));
    this.root.addEventListener("keydown", (event) => trapFocus(event, this.root));
    this.render();
    this.clientIp = this.client.clientIp || "…";
    this.client.signal.onPush((push) => {
      if (push.type === "welcome") {
        this.clientIp = push.clientIp;
        void this.refreshSelfInfo();
      }
      if (push.type === "routeChanged") {
        this.addLog(`${t("routeChangedAt")} ${new Date(push.result.timestamp).toLocaleTimeString()}`);
        this.renderHops(push.result);
      }
    });
    this.startLoops();
    // Show the path as soon as the panel opens.
    void this.trace();
  }

  get element(): HTMLElement {
    return this.root;
  }

  close(): void {
    this.timers.forEach((t) => clearInterval(t));
    if (this.watching) {
      void this.client.signal.request("setRouteWatch", { enabled: false });
    }
    this.root.remove();
    this.onClose();
  }

  // ---------- rendering ----------

  private render(): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 280;
    this.canvas.height = 56;
    this.canvas.className = "rtt-canvas";

    this.pathSummary = document.createElement("div");
    this.pathSummary.className = "path-summary";

    const traceBtn = button(t("traceRoute"), () => void this.trace());
    const watchBtn = button(t("watch"), () => this.toggleWatch(watchBtn));
    const speedBtn = button(t("speedTest"), () => void this.speedTest());
    speedBtn.id = "speed-btn";
    traceBtn.id = "trace-btn";

    this.hopsBox = document.createElement("div");
    this.hopsBox.className = "hops";
    this.log = document.createElement("div");
    this.log.className = "net-log";
    this.mediaStats = document.createElement("div");
    this.mediaStats.className = "media-stats";
    this.connectionSummary = document.createElement("div");
    this.connectionSummary.className = "connection-summary checking";
    this.connectionSummary.textContent = t("connectionChecking");

    const closeBtn = button("×", () => this.close());
    closeBtn.className = "panel-close";
    closeBtn.setAttribute("aria-label", t("close"));
    const title = document.createElement("div");
    title.className = "panel-head";
    const titleText = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = t("meeting");
    const heading = document.createElement("h2");
    heading.textContent = t("netTitle");
    titleText.append(eyebrow, heading);
    title.append(titleText, closeBtn);

    this.root.append(
      title,
      this.connectionSummary,
      row(t("yourIp"), this.clientIp),
      this.canvas,
      this.mediaStats,
      rowButtons(traceBtn, watchBtn, speedBtn),
      header(t("pathToServer")),
      this.pathSummary,
      this.hopsBox,
      header(t("events")),
      this.log
    );
  }

  private addLog(msg: string): void {
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = msg;
    this.log.prepend(line);
    while (this.log.children.length > 30) this.log.lastChild?.remove();
  }

  private renderSparkline(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    if (this.samples.length < 2) return;
    const values = this.samples.map((s) => s.rttMs);
    const max = Math.max(...values, 10);
    ctx.strokeStyle = "#4c7dff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.samples.forEach((s, i) => {
      const x = (i / (this.samples.length - 1)) * width;
      const y = height - (s.rttMs / max) * (height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = values[values.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    ctx.fillStyle = "#9aa0a8";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${last.toFixed(0)}ms ${t("now")} · ${avg.toFixed(0)}ms ${t("average")}`, 4, 12);
  }

  private renderHops(result: TraceResult): void {
    this.hopsBox.replaceChildren();
    for (const hop of result.hops) {
      this.hopsBox.append(hopRow(hop));
    }
  }

  private async refreshSelfInfo(): Promise<void> {
    try {
      const data = (await this.client.signal.request("traceroute", {})) as unknown as TraceResult;
      this.renderHops(data);
      const last = [...data.hops].reverse().find((h) => h.ip);
      this.addLog(
        `${t("traceComplete")}: ${data.hops.length} ${t("hops")}` +
          (last?.org ? `, ${t("via")} ${last.org}` : "")
      );
    } catch (e) {
      this.addLog(`${t("traceFailed")}: ${(e as Error).message}`);
    }
  }

  private async trace(): Promise<void> {
    this.addLog(t("tracing"));
    await this.refreshSelfInfo();
  }

  private toggleWatch(btn: HTMLButtonElement): void {
    this.watching = !this.watching;
    btn.classList.toggle("active", this.watching);
    void this.client.signal.request("setRouteWatch", { enabled: this.watching, intervalSec: 30 });
    this.addLog(this.watching ? t("watchOn") : t("watchOff"));
  }

  private async speedTest(): Promise<void> {
    const btn = this.root.querySelector<HTMLButtonElement>("#speed-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = t("testing");
    try {
      const started = performance.now();
      let received = 0;
      const res = await fetch(apiUrl("/api/speedtest?bytes=32000000"), { cache: "no-store" });
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
      const seconds = (performance.now() - started) / 1000;
      const mbps = (received * 8) / seconds / 1e6;
      this.addLog(`${t("downlink")}: ${mbps.toFixed(0)} Mbps (${(received / 1e6).toFixed(0)} MB in ${seconds.toFixed(1)}s)`);
    } catch (e) {
      this.addLog(`${t("speedTestFailed")}: ${(e as Error).message}`);
    }
    btn.disabled = false;
    btn.textContent = t("speedTest");
  }

  private startLoops(): void {
    // WS RTT sampling every second.
    this.timers.push(
      window.setInterval(() => {
        const t0 = performance.now();
        void this.client.signal
          .request("ping")
          .then(() => {
            this.samples.push({ t: Date.now(), rttMs: performance.now() - t0 });
            if (this.samples.length > 90) this.samples.shift();
            this.renderSparkline();
          })
          .catch(() => undefined);
      }, 1000)
    );
    // WebRTC stats every second.
    this.timers.push(window.setInterval(() => void this.pollWebrtcStats(), 1000));
  }

  private async pollWebrtcStats(): Promise<void> {
    try {
      const stats = await this.client.getStats();
      const now = performance.now();
      const dt = this.lastStatsT ? (now - this.lastStatsT) / 1000 : 0;
      this.lastStatsT = now;
      let sendBytes = 0;
      let recvBytes = 0;
      let jitterSum = 0;
      let jitterN = 0;
      let lost = 0;
      let rttMs: number | null = null;

      const eachStat = (report: unknown, fn: (s: Record<string, unknown>) => void): void => {
        if (!report) return;
        if (report instanceof Map) report.forEach(fn as never);
        else if (typeof (report as { forEach?: unknown }).forEach === "function") {
          (report as { forEach: (f: (s: unknown) => void) => void }).forEach(fn as never);
        }
      };

      for (const report of [stats.send, stats.recv]) {
        eachStat(report, (s) => {
          const type = s.type as string;
          if (type === "outbound-rtp" && typeof s.bytesSent === "number" && !s.isRemote) {
            sendBytes += s.bytesSent as number;
          }
          if (type === "inbound-rtp" && typeof s.bytesReceived === "number") {
            recvBytes += s.bytesReceived as number;
            if (typeof s.jitter === "number") {
              jitterSum += s.jitter as number;
              jitterN++;
            }
            if (typeof s.packetsLost === "number") lost += Math.max(0, s.packetsLost as number);
          }
          if (
            type === "candidate-pair" &&
            s.state === "succeeded" &&
            typeof s.currentRoundTripTime === "number"
          ) {
            rttMs = (s.currentRoundTripTime as number) * 1000;
          }
        });
      }

      const upBps = dt > 0 ? ((sendBytes - this.lastSendBytes) * 8) / dt : 0;
      const downBps = dt > 0 ? ((recvBytes - this.lastRecvBytes) * 8) / dt : 0;
      this.lastSendBytes = sendBytes;
      this.lastRecvBytes = recvBytes;

      const fmt = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${(bps / 1e3).toFixed(0)} kbps`);
      this.mediaStats.dataset.up = fmt(upBps);
      this.mediaStats.dataset.down = fmt(downBps);
      this.mediaStats.dataset.rtt = rttMs === null ? "–" : `${(rttMs as number).toFixed(0)} ms`;
      this.mediaStats.dataset.jitter = jitterN ? `${((jitterSum / jitterN) * 1000).toFixed(1)} ms` : "–";
      this.mediaStats.dataset.lost = String(lost);
      const quality = rttMs === null ? "checking" : lost > 20 || rttMs > 300 ? "poor" : lost > 5 || rttMs > 150 ? "unstable" : "good";
      this.connectionSummary.className = `connection-summary ${quality}`;
      this.connectionSummary.textContent = t(
        quality === "poor" ? "connectionPoor" : quality === "unstable" ? "connectionUnstable" : quality === "good" ? "connectionGood" : "connectionChecking"
      );
      this.renderMediaStatsLine();
    } catch {
      /* transports not ready */
    }
  }

  private renderMediaStatsLine(): void {
    const d = this.mediaStats.dataset;
    this.mediaStats.replaceChildren(
      stat(`${t("uplink")} ${d.up ?? "–"}`),
      stat(`${t("downlink")} ${d.down ?? "–"}`),
      stat(`${t("rtt")} ${d.rtt ?? "–"}`),
      stat(`${t("jitter")} ${d.jitter ?? "–"}`),
      stat(`${t("lostPackets")} ${d.lost ?? "–"}`)
    );
  }
}

// ---------- tiny DOM helpers ----------

function button(label: string, onclick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "control small";
  b.textContent = label;
  b.onclick = onclick;
  return b;
}

function rowButtons(...btns: HTMLButtonElement[]): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "row gap panel-tools";
  btns.forEach((b) => div.append(b));
  return div;
}

function header(text: string): HTMLElement {
  const h = document.createElement("h3");
  h.className = "panel-section-title";
  h.textContent = text;
  return h;
}

function row(label: string, value: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "panel-row";
  const l = Object.assign(document.createElement("span"), { textContent: label });
  const v = Object.assign(document.createElement("span"), { textContent: value });
  v.className = "mono";
  div.append(l, v);
  return div;
}

function stat(text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "stat-chip";
  s.textContent = text;
  return s;
}

function trapFocus(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab") return;
  const focusable = [...root.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")]
    .filter((node) => node.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function hopRow(hop: HopInfo): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "hop-row";
  const cc = hop.country && hop.country !== "--" ? hop.country : "";
  const parts = [
    `#${hop.hop}`,
    hop.ip ?? "* * *",
    hop.rttMs != null ? `${hop.rttMs.toFixed(1)} ms` : "",
    hop.org ?? "",
    cc,
  ].filter(Boolean);
  div.textContent = parts.join("  ·  ");
  if (!hop.ip) div.classList.add("timeout");
  return div;
}

