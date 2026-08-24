import { describe, expect, it } from "vitest";
import { pickDominant } from "../src/layout.js";

describe("pickDominant", () => {
  const tiles = ["self:cam", "p1:cam", "p2:cam", "p1:screen:s9"];

  it("prefers the pinned tile", () => {
    expect(pickDominant({ pinned: "p2:cam", lastSpeaker: "p1:cam", tiles })).toBe("p2:cam");
  });

  it("falls back to the last active speaker", () => {
    expect(pickDominant({ pinned: null, lastSpeaker: "p1:cam", tiles })).toBe("p1:cam");
  });

  it("falls back to the first tile", () => {
    expect(pickDominant({ pinned: null, lastSpeaker: null, tiles })).toBe("self:cam");
  });

  it("ignores pins and speakers that are no longer present", () => {
    expect(pickDominant({ pinned: "gone:cam", lastSpeaker: "also-gone:cam", tiles })).toBe("self:cam");
    expect(pickDominant({ pinned: "gone:cam", lastSpeaker: "p2:cam", tiles })).toBe("p2:cam");
  });

  it("returns null for an empty room", () => {
    expect(pickDominant({ pinned: null, lastSpeaker: null, tiles: [] })).toBeNull();
  });
});
