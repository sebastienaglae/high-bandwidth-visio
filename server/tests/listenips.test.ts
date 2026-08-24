import { describe, expect, it, vi, afterEach } from "vitest";

// Avoid loading the native mediasoup worker bindings (slow) in unit tests.
vi.mock("mediasoup", () => ({ createWorker: vi.fn() }));

/**
 * resolveListenIps is a pure function of env vars + NIC detection.
 * We re-import the module with different stubbed environments.
 */
async function loadWithEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import("../src/rooms.js");
  return mod.resolveListenIps() as { ip: string; announcedIp?: string }[];
}

afterEach(() => {
  delete process.env.LISTEN_IP;
  delete process.env.ANNOUNCED_IP;
});

describe("resolveListenIps", () => {
  it("dev loopback: binds 127.0.0.1 and announces nothing (loopback candidate only)", async () => {
    const ips = await loadWithEnv({ LISTEN_IP: "127.0.0.1" });
    expect(ips[0].ip).toBe("127.0.0.1");
    // Announcing a non-bound IP (e.g. the LAN NIC) breaks ICE — must be undefined.
    expect(ips[0].announcedIp).toBeUndefined();
  });

  it("wildcard bind without ANNOUNCED_IP falls back to primary NIC", async () => {
    const ips = await loadWithEnv({ LISTEN_IP: "0.0.0.0" });
    // mediasoup needs a concrete interface; wildcard must never leak through
    expect(ips[0].ip).not.toBe("0.0.0.0");
    expect(ips[0].announcedIp ?? "").not.toBe("0.0.0.0");
  });

  it("ANNOUNCED_IP wins over everything (production NAT/Docker)", async () => {
    const ips = await loadWithEnv({ LISTEN_IP: "0.0.0.0", ANNOUNCED_IP: "203.0.113.10" });
    expect(ips[0].announcedIp).toBe("203.0.113.10");
    expect(ips[0].ip).not.toBe("0.0.0.0");
  });

  it("concrete public listen IP announces itself when no ANNOUNCED_IP", async () => {
    const ips = await loadWithEnv({ LISTEN_IP: "198.51.100.7" });
    expect(ips[0]).toEqual({ ip: "198.51.100.7", announcedIp: "198.51.100.7" });
  });
});
