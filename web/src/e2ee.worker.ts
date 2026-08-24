// Insertable-streams worker: encrypts outgoing / decrypts incoming frames.
// Main thread posts { operation: "setKey", keyMaterial } once, then
// { operation: "encode" | "decode", streams } per sender/receiver.

import {
  decodeFrameData,
  deriveKey,
  encodeFrameData,
} from "./e2ee-crypto.js";

let key: CryptoKey | null = null;

interface Streams {
  readable: ReadableStream;
  writable: WritableStream;
}

async function pump(operation: "encode" | "decode", streams: Streams): Promise<void> {
  const reader = streams.readable.getReader();
  const writer = streams.writable.getWriter();

  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) return;
    if (!key || !(frame.data instanceof ArrayBuffer || ArrayBuffer.isView(frame.data))) {
      writer.write(frame);
      continue;
    }
    const bytes = new Uint8Array(frame.data);
    try {
      const out =
        operation === "encode"
          ? await encodeFrameData(key, bytes)
          : await decodeFrameData(key, bytes);
      if (!out) {
        // Undecryptable (wrong key or corrupt): drop the frame.
        frame.close();
        continue;
      }
      frame.data = out;
      writer.write(frame);
    } catch {
      frame.close();
    }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as { operation: string; keyMaterial?: string; streams?: Streams };
  if (d.operation === "setKey" && d.keyMaterial) {
    key = await deriveKey(d.keyMaterial);
    return;
  }
  if ((d.operation === "encode" || d.operation === "decode") && d.streams) {
    void pump(d.operation, d.streams);
  }
};
