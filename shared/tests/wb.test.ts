import { describe, expect, it } from "vitest";
import { validateWbOps } from "../src/index.js";
import type { WBOp } from "../src/index.js";

const goodStroke = { id: "s1", color: "#d97757", width: 4 };

describe("validateWbOps", () => {
  it("accepts valid start/pts/end/clear ops", () => {
    const ops: WBOp[] = [
      { k: "start", s: goodStroke, pts: [0.1, 0.2, 0.3, 0.4] },
      { k: "pts", id: "s1", pts: [0.5, 0.5] },
      { k: "end", id: "s1" },
      { k: "clear" },
    ];
    expect(validateWbOps(ops)).toHaveLength(4);
  });

  it("rejects empty or oversized batches", () => {
    expect(validateWbOps([])).toBeNull();
    expect(validateWbOps(Array.from({ length: 33 }, () => ({ k: "clear" })))).toBeNull();
  });

  it("rejects non-hex colors", () => {
    expect(
      validateWbOps([{ k: "start", s: { ...goodStroke, color: "red" }, pts: [0, 0] }])
    ).toBeNull();
    expect(
      validateWbOps([{ k: "start", s: { ...goodStroke, color: "#GGHHII" }, pts: [0, 0] }])
    ).toBeNull();
  });

  it("rejects out-of-range widths", () => {
    expect(
      validateWbOps([{ k: "start", s: { ...goodStroke, width: 0 }, pts: [0, 0] }])
    ).toBeNull();
    expect(
      validateWbOps([{ k: "start", s: { ...goodStroke, width: 100 }, pts: [0, 0] }])
    ).null;
  });

  it("rejects coordinates outside the normalized canvas", () => {
    expect(validateWbOps([{ k: "start", s: goodStroke, pts: [-5, 0.5] }])).toBeNull();
    expect(validateWbOps([{ k: "start", s: goodStroke, pts: [9, 9] }])).toBeNull();
  });

  it("rejects odd-length point arrays and huge payloads", () => {
    expect(validateWbOps([{ k: "pts", id: "s", pts: [0.1] }])).toBeNull();
    expect(validateWbOps([{ k: "pts", id: "s", pts: Array(2002).fill(0.5) }])).toBeNull();
  });

  it("rejects unknown op kinds and malformed ids", () => {
    expect(validateWbOps([{ k: "nuke" } as never])).toBeNull();
    expect(validateWbOps([{ k: "end", id: "" }])).not.toBeNull(); // empty allowed but short
    expect(validateWbOps([{ k: "end", id: "x".repeat(65) }])).toBeNull();
  });

  it("returns a sanitized copy (no extra properties survive)", () => {
    const out = validateWbOps([
      { k: "start", s: { ...goodStroke }, pts: [0.1, 0.1], ...( { evil: "<script>" } as object) },
    ]);
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain("evil");
  });

  it("accepts collaborative drawing tools and bounded opacity", () => {
    const out = validateWbOps([{ k: "start", s: { ...goodStroke, tool: "highlighter", opacity: 0.32 }, pts: [0.1, 0.1] }]);
    expect(out?.[0]).toMatchObject({ s: { tool: "highlighter", opacity: 0.32 } });
    expect(validateWbOps([{ k: "start", s: { ...goodStroke, tool: "spray" }, pts: [0.1, 0.1] }])).toBeNull();
    expect(validateWbOps([{ k: "start", s: { ...goodStroke, opacity: 0.01 }, pts: [0.1, 0.1] }])).toBeNull();
  });
});
