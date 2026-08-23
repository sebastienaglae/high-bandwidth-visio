import type { HopInfo, TraceResult } from "@visio/shared";
import { rawTraceroute, pathHashOf } from "./trace.js";
import { enrichIp } from "./geo.js";

export async function traceAndEnrich(target: string): Promise<TraceResult> {
  const raw = await rawTraceroute(target);

  // Enrich unique IPs in parallel (Cymru lookups are DNS; cache absorbs repeats).
  const uniqueIps = [...new Set(raw.map((h) => h.ip).filter((ip): ip is string => !!ip))];
  const enriched = await Promise.all(uniqueIps.map((ip) => enrichIp(ip)));
  const byIp = new Map(uniqueIps.map((ip, i) => [ip, enriched[i]]));

  const hops: HopInfo[] = raw.map((h) => ({
    hop: h.hop,
    ip: h.ip,
    rttMs: h.rttMs,
    ...(h.ip ? byIp.get(h.ip) : {}),
  }));

  return {
    target,
    hops,
    pathHash: pathHashOf(raw),
    timestamp: Date.now(),
  };
}
