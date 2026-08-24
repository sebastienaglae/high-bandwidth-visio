// End-to-end media encryption primitives (WebCrypto AES-GCM).
//
// The room token IS the key material: only people holding the invite link
// can decrypt frames. The SFU forwards ciphertext it cannot read.
//
// Wire format per frame: [1 unencrypted byte][12-byte IV][AES-GCM ciphertext+tag]
// The leading unencrypted byte keeps the codec payload header inspectable,
// as required by the WebRTC insertable-streams pipeline.

const SALT = "visio-e2ee-v1";
const ITERATIONS = 100_000;

export function e2eeSupported(): boolean {
  return (
    typeof RTCRtpSender !== "undefined" &&
    "createEncodedStreams" in RTCRtpSender.prototype
  );
}

export async function deriveKey(token: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(token), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(SALT), iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFrame(
  key: CryptoKey,
  payload: BufferSource,
  iv: BufferSource
): Promise<Uint8Array> {
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload as BufferSource);
  return new Uint8Array(ct);
}

export async function decryptFrame(
  key: CryptoKey,
  iv: BufferSource,
  ciphertext: BufferSource
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext as BufferSource);
  return new Uint8Array(pt);
}

/** Encrypt one frame into the wire format above. */
export async function encodeFrameData(
  key: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await encryptFrame(key, data.subarray(1) as BufferSource, iv);
  const out = new Uint8Array(1 + iv.length + ct.length);
  out[0] = data[0];
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

/** Decrypt one frame; returns null when the key is wrong or data corrupt. */
export async function decodeFrameData(
  key: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array | null> {
  if (data.length < 1 + 12 + 16) return null;
  try {
    const pt = await decryptFrame(key, data.subarray(1, 13) as BufferSource, data.subarray(13) as BufferSource);
    const out = new Uint8Array(pt.length + 1);
    out[0] = data[0];
    out.set(pt, 1);
    return out;
  } catch {
    return null;
  }
}



