import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isPrivateIp,
  parseOriginTxt,
  parseAsnTxt,
  enrichIp,
} from "../src/net/geo.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPrivateIp", () => {
  it.each([
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.254", true],
    ["127.0.0.1", true],
    ["169.254.1.1", true],
    ["100.64.0.1", true],
    ["::1", true],
    ["fe80::1", true],
    ["fd00::1", true],
    // public
    ["1.1.1.1", false],
    ["8.8.8.8", false],
    ["172.32.0.1", false], // just outside 172.16-31
    ["172.15.255.255", false],
    ["192.169.0.1", false],
    ["203.0.113.10", false],
  ])("%s -> %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("parseOriginTxt (Team Cymru origin record)", () => {
  it("parses a well-formed record", () => {
    const r = parseOriginTxt("15169 | 8.8.8.0/24 | US | arin | 2023-12-28");
    expect(r).toEqual({ asn: 15169, country: "US" });
  });

  it("tolerates extra whitespace", () => {
    const r = parseOriginTxt("  13335  |  104.16.0.0/12  |  US  |  arin  |  x");
    expect(r?.asn).toBe(13335);
    expect(r?.country).toBe("US");
  });

  it("returns null on malformed input", () => {
    expect(parseOriginTxt("garbage")).toBeNull();
    expect(parseOriginTxt("")).toBeNull();
    expect(parseOriginTxt("not-an-asn | x | YY | z")).toBeNull();
  });
});

describe("parseAsnTxt (Team Cymru ASN record)", () => {
  it("extracts org and country", () => {
    const r = parseAsnTxt("15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC, US");
    expect(r.org).toBe("GOOGLE - Google LLC, US");
    expect(r.country).toBe("US");
  });

  it("falls back when the org field is missing", () => {
    const r = parseAsnTxt("1234 | FR | ripe | 1995-01-01");
    expect(r.org).toBe("1995-01-01"); // fields[3]
    expect(r.country).toBe("FR");
  });

  it("handles empty input safely", () => {
    expect(parseAsnTxt("").country).toBeUndefined();
  });
});

describe("enrichIp", () => {
  it("short-circuits private addresses without DNS", async () => {
    const info = await enrichIp("192.168.1.254");
    expect(info).toEqual({ org: "Private network", country: "--" });
  });

  it("caches successful lookups (second call does not hit DNS)", async () => {
    const dns = await import("node:dns");
    const spy = vi
      .spyOn(dns.promises, "resolveTxt")
      .mockResolvedValueOnce([["15169 | 8.8.8.0/24 | US | arin | 2023-12-28"]]) // origin record
      .mockResolvedValueOnce([["15169 | US | arin | 2000-03-30 | GOOGLE - Google LLC, US"]]); // AS detail
    const first = await enrichIp("8.8.4.4"); // unique IP to avoid cross-test cache
    expect(first.asn).toBe(15169);
    expect(first.org).toBe("GOOGLE - Google LLC, US");
    expect(spy).toHaveBeenCalledTimes(2);
    await enrichIp("8.8.4.4");
    expect(spy).toHaveBeenCalledTimes(2); // cache hit: no new DNS calls
  });

  it("returns empty info when DNS fails entirely", async () => {
    const dns = await import("node:dns");
    vi.spyOn(dns.promises, "resolveTxt").mockRejectedValue(
      Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
    );
    const info = await enrichIp("9.9.4.4");
    expect(info).toEqual({});
  });
});
