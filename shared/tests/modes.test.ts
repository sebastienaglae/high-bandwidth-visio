import { describe, expect, it } from "vitest";
import { MODES, MODE_PROFILES } from "../src/index.js";
import type { Mode } from "../src/index.js";

describe("mode system", () => {
  it("defines exactly five modes", () => {
    expect(MODES).toHaveLength(5);
    expect(new Set(MODES).size).toBe(5);
  });

  it("every mode has a complete profile", () => {
    for (const mode of MODES) {
      const p = MODE_PROFILES[mode];
      expect(p, `profile missing for ${mode}`).toBeDefined();
      expect(p.mode).toBe(mode);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect([null, 360, 480, 720, 1080, 1440]).toContain(p.maxHeight);
      expect([null, 30, 60]).toContain(p.maxFps);
    }
  });

  it("preferred layers stay within simulcast bounds", () => {
    for (const mode of MODES) {
      const p = MODE_PROFILES[mode];
      expect(p.preferredSpatialLayer).toBeGreaterThanOrEqual(0);
      expect(p.preferredSpatialLayer).toBeLessThanOrEqual(2);
      expect(p.preferredTemporalLayer).toBeGreaterThanOrEqual(0);
      expect(p.preferredTemporalLayer).toBeLessThanOrEqual(2);
    }
  });

  it("jitter budget grows monotonically toward quality modes", () => {
    const jitter = MODES.map((m) => MODE_PROFILES[m].jitterBufferTargetMs ?? 0);
    const sorted = [...jitter].sort((a, b) => a - b);
    expect(jitter).toEqual(sorted);
  });

  it("ultra mode is the strictest (lowest capture ceiling)", () => {
    expect(MODE_PROFILES.ultra.maxHeight).toBeLessThanOrEqual(
      ...MODES.filter((m) => m !== "ultra")
        .map((m) => MODE_PROFILES[m].maxHeight ?? Infinity)
    );
  });

  it("max mode is uncapped or native", () => {
    const p: (typeof MODE_PROFILES)[Mode] = MODE_PROFILES.max;
    expect(p.maxHeight === null || p.maxHeight >= 1440).toBe(true);
    expect(p.maxFps === null || p.maxFps >= 60).toBe(true);
  });
});
