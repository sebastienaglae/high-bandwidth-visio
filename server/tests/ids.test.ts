import { describe, expect, it } from "vitest";
import { randomRoomToken, newId } from "../src/ids.js";

describe("randomRoomToken", () => {
  it("produces URL-safe tokens of expected length (128-bit)", () => {
    const token = randomRoomToken();
    // 16 bytes -> 22 base64url chars
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("is unique across many samples", () => {
    const seen = new Set(Array.from({ length: 5_000 }, () => randomRoomToken()));
    expect(seen.size).toBe(5_000);
  });

  it("contains only characters valid in URLs", () => {
    for (let i = 0; i < 100; i++) {
      expect(randomRoomToken()).not.toMatch(/[+/=]/);
    }
  });
});

describe("newId", () => {
  it("prefixes the id and is unique", () => {
    const a = newId("peer");
    const b = newId("peer");
    expect(a).toMatch(/^peer-[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("different prefixes do not collide", () => {
    expect(newId("a")).not.toBe(newId("b"));
  });
});
