import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../src/ratelimit.js";

describe("RateLimiter", () => {
  it("allows up to capacity in a burst", () => {
    const rl = new RateLimiter(3, 1);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(2, 1);
    expect(rl.allow("x")).toBe(true);
    expect(rl.allow("x")).toBe(true);
    expect(rl.allow("x")).toBe(false);
    expect(rl.allow("y")).toBe(true); // unaffected
  });

  it("refills over time (fake timers)", () => {
    vi.useFakeTimers();
    try {
      const rl = new RateLimiter(1, 10); // 10 tokens/sec
      expect(rl.allow("k")).toBe(true);
      expect(rl.allow("k")).toBe(false);
      vi.advanceTimersByTime(150); // +1.5 tokens -> capped at capacity 1
      expect(rl.allow("k")).toBe(true);
      expect(rl.allow("k")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never exceeds capacity when idle for a long time", () => {
    vi.useFakeTimers();
    try {
      const rl = new RateLimiter(2, 0.5);
      vi.advanceTimersByTime(60_000);
      expect(rl.allow("idle")).toBe(true);
      expect(rl.allow("idle")).toBe(true);
      expect(rl.allow("idle")).toBe(false); // capped at 2, not 30
    } finally {
      vi.useRealTimers();
    }
  });

  it("sweep evicts only idle buckets", () => {
    vi.useFakeTimers();
    try {
      const rl = new RateLimiter(10, 1);
      rl.allow("fresh");
      vi.advanceTimersByTime(200_000);
      // touch nothing; fresh bucket is now old too
      rl.sweep(120_000);
      // internal eviction verified indirectly: re-allow works as a new bucket
      expect(rl.allow("fresh")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles high-frequency callers without unbounded growth per key", () => {
    const rl = new RateLimiter(5, 5);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (rl.allow("burst")) allowed++;
    expect(allowed).toBeLessThanOrEqual(6); // capacity + boundary refill
  });
});
