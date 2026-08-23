import { spawn } from "node:child_process";

export interface RawHop {
  hop: number;
  ip: string | null;
  rttMs: number | null;
}

const MAX_HOPS = 20;
const TIMEOUT_MS = 25_000;

function isWindows(): boolean {
  return process.platform === "win32";
}

function run(bin: string, args: string[], parse: (out: string) => RawHop[]): Promise<RawHop[]> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(parse(out));
    });
  });
}

export function extractTimes(line: string): number | null {
  // Single pattern covering "12 ms", "1.234 ms" and French locale "3,5 ms".
  const times = [...line.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*ms/gi)].map((m) =>
    parseFloat(m[1].replace(",", "."))
  );
  if (times.length === 0) return null;
  return Math.min(...times);
}

export function extractIp(line: string): string | null {
  const v4 = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  if (v4) return v4[1];
  const v6 = line.match(/\b([0-9a-fA-F:]{2,39})\b/);
  if (v6 && line.includes("::")) return v6[1];
  return null;
}

export function parseTracert(out: string): RawHop[] {
  const hops: RawHop[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3})\s+(.*)$/);
    if (!m) continue;
    const hop = parseInt(m[1], 10);
    if (Number.isNaN(hop) || hop > MAX_HOPS + 5) continue;
    const ip = extractIp(m[2]);
    const rtt = extractTimes(m[2]);
    hops.push({ hop, ip, rttMs: ip ? rtt : null });
  }
  return dedupe(hops);
}

export function parseTracerouteN(out: string): RawHop[] {
  const hops: RawHop[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3})[ :\s]+(.*)$/);
    if (!m) continue;
    const hop = parseInt(m[1], 10);
    const rest = m[2];
    const ip = extractIp(rest);
    const rtt = extractTimes(rest);
    hops.push({ hop, ip, rttMs: ip ? rtt : null });
  }
  return dedupe(hops);
}

export function parseTracepath(out: string): RawHop[] {
  const hops: RawHop[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3}):?\s+(.*)$/);
    if (!m || /Too many hops/i.test(line)) continue;
    const hop = parseInt(m[1], 10);
    const rest = m[2];
    const ip = extractIp(rest.replace(/\([^)]*\)/g, "")); // prefer bare IP; parens removed
    const fallbackIp = ip ?? rest.match(/\(([^)]+)\)/)?.[1] ?? null;
    hops.push({ hop, ip: normalizeIp(fallbackIp), rttMs: extractTimes(rest) });
  }
  return dedupe(hops);
}

export function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;
  return /^(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]{2,39})$/.test(ip) ? ip : null;
}

export function dedupe(hops: RawHop[]): RawHop[] {
  const seen = new Set<number>();
  return hops.filter((h) => {
    if (seen.has(h.hop)) return false;
    seen.add(h.hop);
    h.ip = normalizeIp(h.ip);
    return true;
  });
}

/** Traceroute from this host to `target`, parsed into hops. */
export async function rawTraceroute(target: string): Promise<RawHop[]> {
  if (isWindows()) {
    // tracert -d skips reverse DNS (faster); we enrich via DNS anyway.
    return run("tracert", ["-d", "-w", "800", "-h", String(MAX_HOPS), target], parseTracert);
  }
  // Prefer traceroute -n; fall back to tracepath (usually present on Debian).
  try {
    const res = await run("traceroute", ["-n", "-q", "1", "-w", "1", "-m", String(MAX_HOPS), target], parseTracerouteN);
    if (res.length > 0) return res;
  } catch {
    /* binary missing */
  }
  return run("tracepath", ["-m", String(MAX_HOPS), target], parseTracepath);
}

export function pathHashOf(hops: RawHop[]): string {
  return Buffer.from(JSON.stringify(hops.map((h) => h.ip)))
    .toString("base64url")
    .slice(0, 32);
}
