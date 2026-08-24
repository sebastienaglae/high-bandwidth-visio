import { describe, expect, it } from "vitest";
import {
  decodeFrameData,
  deriveKey,
  encodeFrameData,
  e2eeSupported,
} from "../src/e2ee-crypto.js";

const token = "s3cret-room-token";
const otherToken = "different-room-token";

describe("e2ee frame crypto", () => {
  it("round-trips a payload", async () => {
    const key = await deriveKey(token);
    const frame = new Uint8Array([0xAB, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const enc = await encodeFrameData(key, frame);
    // First byte stays unencrypted.
    expect(enc[0]).toBe(0xAB);
    // Ciphertext differs from plaintext.
    expect(enc.length).toBeGreaterThan(frame.length);
    const dec = await decodeFrameData(key, enc);
    expect(dec).not.toBeNull();
    expect([...dec!]).toEqual([...frame]);
  });

  it("produces different ciphertext for the same input (random IV)", async () => {
    const key = await deriveKey(token);
    const frame = new Uint8Array([1, 2, 3]);
    const a = await encodeFrameData(key, frame);
    const b = await encodeFrameData(key, frame);
    expect([...a.subarray(1)]).not.toEqual([...b.subarray(1)]);
  });

  it("fails to decrypt with the wrong room token", async () => {
    const key = await deriveKey(token);
    const wrong = await deriveKey(otherToken);
    const enc = await encodeFrameData(key, new Uint8Array([7, 7, 7, 7]));
    expect(await decodeFrameData(wrong, enc)).toBeNull();
  });

  it("rejects truncated ciphertext", async () => {
    const key = await deriveKey(token);
    const enc = await encodeFrameData(key, new Uint8Array([7, 7, 7, 7]));
    expect(await decodeFrameData(key, enc.subarray(0, 10))).toBeNull();
  });

  it("keys are deterministic per token", async () => {
    const a = await deriveKey(token);
    const frame = new Uint8Array([9, 9]);
    const enc = await encodeFrameData(a, frame);
    const b = await deriveKey(token);
    expect(await decodeFrameData(b, enc)).not.toBeNull();
  });

  it("reports support in browser environments", () => {
    // happy-dom has no RTCRtpSender; the function must not throw.
    expect(typeof e2eeSupported()).toBe("boolean");
  });
});
