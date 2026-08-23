import { describe, expect, it, vi } from "vitest";

vi.mock("mediasoup", () => ({
  createWorker: vi.fn(async () => {
    throw new Error("no worker in unit tests");
  }),
}));

describe("room registry guards (defense in depth)", () => {
  it("getOrCreateRoom rejects malformed room ids before touching mediasoup", async () => {
    vi.resetModules();
    const { getOrCreateRoom } = await import("../src/rooms.js");
    await expect(getOrCreateRoom("../etc/passwd")).rejects.toThrow("invalid room id");
    await expect(getOrCreateRoom("short")).rejects.toThrow("invalid room id");
    await expect(getOrCreateRoom("a".repeat(65))).rejects.toThrow("invalid room id");
    await expect(getOrCreateRoom("with spaces here 123")).rejects.toThrow("invalid room id");
  });
});
