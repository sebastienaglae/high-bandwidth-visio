// Whiteboard protocol — vector ops, coordinates normalized 0..1.

export interface WBStroke {
  id: string;
  color: string;
  width: number;
}

export type WBOp =
  | { k: "start"; s: WBStroke; pts: number[] } // begin stroke w/ first points
  | { k: "pts"; id: string; pts: number[] } // append points (flat x,y)
  | { k: "end"; id: string }
  | { k: "clear" };

/** Validate an incoming batch of ops. Returns sanitized copy or null if invalid. */
export function validateWbOps(ops: unknown, maxOps = 32): WBOp[] | null {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > maxOps) return null;
  const out: WBOp[] = [];
  for (const op of ops) {
    if (typeof op !== "object" || op === null) return null;
    const o = op as Record<string, unknown>;
    if (o.k === "clear") {
      out.push({ k: "clear" });
      continue;
    }
    if (o.k === "end") {
      if (typeof o.id !== "string" || o.id.length > 64) return null;
      out.push({ k: "end", id: o.id });
      continue;
    }
    if (o.k === "start") {
      const s = o.s as Record<string, unknown> | undefined;
      if (!s || typeof s.id !== "string" || s.id.length > 64) return null;
      if (typeof s.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(s.color)) return null;
      const width = s.width;
      if (typeof width !== "number" || !(width >= 1 && width <= 40)) return null;
      const pts = sanitizePts(o.pts);
      if (!pts) return null;
      out.push({ k: "start", s: { id: s.id, color: s.color, width }, pts });
      continue;
    }
    if (o.k === "pts") {
      if (typeof o.id !== "string" || o.id.length > 64) return null;
      const pts = sanitizePts(o.pts);
      if (!pts || pts.length === 0) return null;
      out.push({ k: "pts", id: o.id, pts });
      continue;
    }
    return null;
  }
  return out;
}

function sanitizePts(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2000 || raw.length % 2 !== 0) {
    return null;
  }
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < -0.1 || v > 1.1) return null;
  }
  return raw as number[];
}
