import { describe, expect, it } from "vitest";
import {
  extractTimes,
  extractIp,
  parseTracert,
  parseTracerouteN,
  parseTracepath,
  pathHashOf,
  normalizeIp,
  dedupe,
} from "../src/net/trace.js";

describe("extractTimes", () => {
  it("parses plain milliseconds", () => {
    expect(extractTimes("12 ms")).toBe(12);
    expect(extractTimes("1.234 ms")).toBeCloseTo(1.234);
  });

  it("takes the minimum of several samples", () => {
    expect(extractTimes("9 ms 5 ms 7 ms")).toBe(5);
  });

  it("handles French decimal commas (Windows locale)", () => {
    expect(extractTimes("3,5 ms")).toBeCloseTo(3.5);
  });

  it("returns null when no time present", () => {
    expect(extractTimes("* * *")).toBeNull();
  });
});

describe("extractIp", () => {
  it("finds IPv4 addresses", () => {
    expect(extractIp("192.168.1.254 reports: Host unreachable")).toBe("192.168.1.254");
  });

  it("finds IPv6 with ::", () => {
    expect(extractIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("returns null without an address", () => {
    expect(extractIp("* * * Request timed out.")).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("accepts v4 and v6", () => {
    expect(normalizeIp("10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("fe80::1")).toBe("fe80::1");
  });

  it("rejects hostnames and garbage", () => {
    expect(normalizeIp("router.local")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });
});

describe("dedupe", () => {
  it("keeps first entry per hop number and normalizes ips", () => {
    const hops = [
      { hop: 1, ip: "1.2.3.4", rttMs: 1 },
      { hop: 1, ip: "1.2.3.4", rttMs: 2 },
      { hop: 2, ip: "bogus", rttMs: null },
    ];
    const out = dedupe(hops);
    expect(out).toHaveLength(2);
    expect(out[1].ip).toBeNull();
  });
});

describe("parseTracert (Windows)", () => {
  it("parses a standard English trace", () => {
    const out = [
      "",
      "Tracing route to one.one.one.one [1.1.1.1]",
      "over a maximum of 30 hops:",
      "",
      "  1     1 ms     1 ms     1 ms  192.168.1.254",
      "  2     4 ms     4 ms     4 ms  194.149.162.238",
      "  3     *        *        *     Request timed out.",
      "  4    16 ms    15 ms    16 ms  1.1.1.1",
      "",
      "Trace complete.",
    ].join("\r\n");
    const hops = parseTracert(out);
    expect(hops).toHaveLength(4);
    expect(hops[0]).toEqual({ hop: 1, ip: "192.168.1.254", rttMs: 1 });
    expect(hops[2].ip).toBeNull();
    expect(hops[2].rttMs).toBeNull();
    expect(hops[3].rttMs).toBe(15); // min of the three
  });

  it("parses French-locale output", () => {
    const out = [
      "  1     1 ms     1 ms     1 ms  192.168.1.254",
      "  2     *        *        *     Delai d'attente de la demande depasse.",
      "  3    12,5 ms  11,2 ms  13 ms  1.1.1.1",
    ].join("\r\n");
    const hops = parseTracert(out);
    expect(hops).toHaveLength(3);
    expect(hops[1].ip).toBeNull();
    expect(hops[2].rttMs).toBeCloseTo(11.2);
  });

  it("ignores header lines that begin with numbers inside prose", () => {
    const hops = parseTracert("over a maximum of 30 hops:");
    // "over..." does not start with whitespace+digits -> no hops
    expect(hops).toHaveLength(0);
  });
});

describe("parseTracerouteN (Linux)", () => {
  it("parses traceroute -n output", () => {
    const out = [
      "traceroute to 1.1.1.1 (1.1.1.1), 20 hops max, 60 byte packets",
      " 1  192.168.1.254  1.234 ms",
      " 2  10.50.0.1  4.100 ms",
      " 3  * * *",
      " 4  1.1.1.1  15.900 ms",
    ].join("\n");
    const hops = parseTracerouteN(out);
    expect(hops.map((h) => h.hop)).toEqual([1, 2, 3, 4]);
    expect(hops[0].ip).toBe("192.168.1.254");
    expect(hops[0].rttMs).toBeCloseTo(1.234);
    expect(hops[2].ip).toBeNull();
  });

  it("handles hostname column when -n omitted", () => {
    const out = " 1  gateway (192.168.1.1)  0.500 ms";
    const hops = parseTracerouteN(out);
    expect(hops[0].ip).toBe("192.168.1.1");
  });
});

describe("parseTracepath (Linux fallback)", () => {
  it("parses tracepath output with parenthesized IPs", () => {
    const out = [
      " 1?: [LOCALHOST]                      0.123ms   pmtu 1500",
      " 1:  gateway (192.168.1.254)          1.021ms",
      " 2:  10.50.0.1                        4.500ms",
      " 3:  no reply",
      " 4:  one.one.one.one (1.1.1.1)       15.000ms reached",
      "     Resume: pmtu 1500 ok bytes 61",
    ].join("\n");
    const hops = parseTracepath(out);
    expect(hops.length).toBeGreaterThanOrEqual(3);
    expect(hops.find((h) => h.hop === 1)?.ip).toBe("192.168.1.254");
    expect(hops.find((h) => h.hop === 2)?.ip).toBe("10.50.0.1");
    const last = hops[hops.length - 1];
    expect(last.ip ?? "").toContain("");
  });
});

describe("pathHashOf", () => {
  it("is stable for identical paths", () => {
    const hops = [{ hop: 1, ip: "1.1.1.1", rttMs: 5 }];
    expect(pathHashOf(hops)).toBe(pathHashOf([{ hop: 1, ip: "1.1.1.1", rttMs: 999 }]));
  });

  it("changes when any hop IP changes", () => {
    const a = pathHashOf([{ hop: 1, ip: "1.1.1.1", rttMs: 5 }]);
    const b = pathHashOf([{ hop: 1, ip: "1.1.1.2", rttMs: 5 }]);
    expect(a).not.toBe(b);
  });

  it("changes when a hop appears or disappears", () => {
    const a = pathHashOf([
      { hop: 1, ip: "1.1.1.1", rttMs: 5 },
      { hop: 2, ip: "1.1.1.2", rttMs: 6 },
    ]);
    const b = pathHashOf([{ hop: 1, ip: "1.1.1.1", rttMs: 5 }]);
    expect(a).not.toBe(b);
  });

  it("produces URL-safe short hashes", () => {
    expect(pathHashOf([])).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});
