// Dominant-tile selection for the speaker layout.
// Priority: pinned tile > last active speaker > first camera tile.

export interface LayoutInput {
  pinned: string | null; // tile key
  lastSpeaker: string | null; // tile key
  /** Tile keys in display order. */
  tiles: string[];
}

export function pickDominant({ pinned, lastSpeaker, tiles }: LayoutInput): string | null {
  if (pinned && tiles.includes(pinned)) return pinned;
  if (lastSpeaker && tiles.includes(lastSpeaker)) return lastSpeaker;
  return tiles[0] ?? null;
}
