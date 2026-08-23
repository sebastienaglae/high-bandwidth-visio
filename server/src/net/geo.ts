import { promises as dns } from "node:dns";

export interface IpInfo {
  asn?: number;
  org?: string;
  country?: string;
}

interface CacheEntry {
  info: IpInfo;
  expires: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const PRIVATE_V4_RANGES: [string, number][] = [
  ["10.", 0],
  ["192.168.", 0],
  ["127.", 0],
  ["169.254.", 0],
  ["100.64.", 0],
];

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  for (const [prefix] of PRIVATE_V4_RANGES) {
    if (ip.startsWith(prefix)) return true;
  }
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export function parseOriginTxt(txt: string): { asn?: number; country?: string } | null {
  // "15169 | 8.8.8.0/24 | US | arin | 2023-12-28"
  const m = txt.match(/^\s*(\d+)\s*\|\s*[^|]+\|\s*([A-Z]{2})\s*\|/);
  if (!m) return null;
  return { asn: parseInt(m[1], 10), country: m[2] };
}

export function parseAsnTxt(txt: string): { org?: string; country?: string } {
  // "15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC, US"
  const fields = txt.split("|").map((f) => f.trim());
  return {
    country: fields[1]?.length === 2 ? fields[1].toUpperCase() : undefined,
    org: fields[4] || fields[3],
  };
}

async function resolveFirstTxt(name: string): Promise<string | null> {
  try {
    const records = await dns.resolveTxt(name);
    for (const rec of records) {
      const joined = rec.join("");
      if (joined.includes("AS")) return joined;
    }
    return records[0]?.join("") ?? null;
  } catch {
    return null;
  }
}

/** Enrich an IP with ASN / organization / country via Team Cymru DNS lookups. */
export async function enrichIp(ip: string): Promise<IpInfo> {
  if (isPrivateIp(ip)) return { org: "Private network", country: "--" };

  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.info;

  let info: IpInfo = {};
  const reversed = ip.split(".").reverse().join(".");
  // Zone format: <reversed-ip>.origin.asn.cymru.com
  const originTxt = await resolveFirstTxt(`${reversed}.origin.asn.cymru.com`);
  const parsed = originTxt ? parseOriginTxt(originTxt) : null;

  if (parsed) {
    info = { asn: parsed.asn, country: parsed.country };
    // Zone format: AS<asn>.asn.cymru.com
    const asnTxt = await resolveFirstTxt(`AS${parsed.asn}.asn.cymru.com`);
    if (asnTxt) {
      const detail = parseAsnTxt(asnTxt);
      if (detail.org) info.org = detail.org;
      if (!info.country && detail.country) info.country = detail.country;
    }
  }

  cache.set(ip, { info, expires: Date.now() + TTL_MS });
  return info;
}
