import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Signal } from "../src/signal.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  OPEN = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  // test helpers
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

const liveSignals: Signal[] = [];

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
});

afterEach(() => {
  // Prevent background reconnect timers from leaking into later tests.
  for (const s of liveSignals.splice(0)) s.close();
});

/** Poll until the condition holds (vi.waitFor is throw-based, not truthy-based). */
async function until(cond: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error("condition not met within timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}
afterEach(() => {
  FakeWebSocket.instances.length = 0;
});

function makeSignal(): { signal: Signal; ws: FakeWebSocket } {
  const signal = new Signal("ws://test/ws");
  liveSignals.push(signal);
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.open();
  return { signal, ws };
}

describe("Signal RPC", () => {
  it("sends requests with incrementing requestIds and resolves on response", async () => {
    const { signal, ws } = makeSignal();
    const p = signal.request("join", { roomId: "abc" });
    const frame = JSON.parse(ws.sent[0]);
    expect(frame.type).toBe("join");
    expect(frame.requestId).toBe(1);
    expect(frame.roomId).toBe("abc");

    ws.emit({ type: "response", requestId: 1, data: { peerId: "p1" } });
    await expect(p).resolves.toEqual({ peerId: "p1" });
  });

  it("requestIds increment across calls", async () => {
    const { signal, ws } = makeSignal();
    const pa = signal.request("a");
    const pb = signal.request("b");
    expect(JSON.parse(ws.sent[0]).requestId).toBe(1);
    expect(JSON.parse(ws.sent[1]).requestId).toBe(2);
    ws.emit({ type: "response", requestId: 1, data: {} });
    ws.emit({ type: "response", requestId: 2, data: {} });
    await expect(pa).resolves.toEqual({});
    await expect(pb).resolves.toEqual({});
  });

  it("rejects the matching request on server error", async () => {
    const { signal, ws } = makeSignal();
    const ok = signal.request("ping");
    const bad = signal.request("produce", { transportId: "x" });
    void ok;
    ws.emit({ type: "error", requestId: 2, message: "transport not found" });
    await expect(bad).rejects.toThrow("transport not found");
    // unrelated pending request must stay pending
    await new Promise((r) => setTimeout(r, 5));
    ws.emit({ type: "response", requestId: 1, data: {} });
    await expect(ok).resolves.toEqual({});
  });

  it("an error without a requestId does NOT reject arbitrary pending calls", async () => {
    const { signal, ws } = makeSignal();
    const p = signal.request("join");
    ws.emit({ type: "error", message: "global failure" });
    await new Promise((r) => setTimeout(r, 5));
    ws.emit({ type: "response", requestId: 1, data: { fine: true } });
    await expect(p).resolves.toEqual({ fine: true });
  });

  it("dispatches push events to all handlers", async () => {
    const { signal, ws } = makeSignal();
    const seen: unknown[] = [];
    const off = signal.onPush((m) => seen.push(m));
    ws.emit({ type: "newPeer", peer: { peerId: "x", displayName: "X" } });
    expect(seen).toHaveLength(1);
    off();
    ws.emit({ type: "peerLeft", peerId: "x" });
    expect(seen).toHaveLength(1);
  });

  it("rejects all pending when the socket closes", async () => {
    const { signal, ws } = makeSignal();
    const p = signal.request("slow");
    signal.close(); // manual close: rejects pending without reconnect timers
    void ws;
    await expect(p).rejects.toThrow("connection closed");
  });

  it("resolves opened once the socket is live", async () => {
    const s2 = new Signal("ws://test2/ws"); liveSignals.push(s2);
    const w2 = FakeWebSocket.instances.at(-1)!;
    let done = false;
    s2.opened.then(() => (done = true));
    expect(done).toBe(false);
    w2.open();
    await until(() => done);
  });

  it("reconnects after an unexpected drop and runs the resume hook", async () => {
    const s = new Signal("ws://test3/ws"); liveSignals.push(s);
    let w = FakeWebSocket.instances.at(-1)!;
    w.open();
    let lost = 0;
    let restored = 0;
    let resumeRequests = 0;
    s.onConnectionLost = () => lost++;
    s.onRestored = () => restored++;
    s.onResume = async () => {
      resumeRequests++;
      await s.request("resume", { peerId: "p1" });
    };

    // Drop: reconnect loop should create a NEW socket after backoff.
    w.close();
    await until(() => FakeWebSocket.instances.length === 2);
    w = FakeWebSocket.instances[1];
    // The resume request is sent as soon as the new socket opens.
    w.open();
    await until(() => resumeRequests === 1);
    // Answer the resume request.
    const frame = JSON.parse(w.sent[0]);
    expect(frame.type).toBe("resume");
    expect(frame.peerId).toBe("p1");
    w.emit({ type: "response", requestId: frame.requestId, data: { peers: [], producers: [] } });
    await until(() => restored === 1);
    expect(lost).toBe(1);

    // Requests flow again over the new socket.
    const p = s.request("ping");
    w.emit({ type: "response", requestId: JSON.parse(w.sent.at(-1)!).requestId, data: {} });
    await expect(p).resolves.toEqual({});
  });

  it("does not reconnect after an explicit close()", async () => {
    const s = new Signal("ws://test4/ws"); liveSignals.push(s);
    FakeWebSocket.instances.at(-1)!.open();
    const before = FakeWebSocket.instances.length;
    s.close();
    await new Promise((r) => setTimeout(r, 1200)); // > first backoff (500ms)
    expect(FakeWebSocket.instances.length).toBe(before);
  });

  it("gives up after the retry budget and stays in the lost state", async () => {
    vi.useFakeTimers();
    try {
      const s = new Signal("ws://test5/ws"); liveSignals.push(s);
      FakeWebSocket.instances.at(-1)!.open();
      const before = FakeWebSocket.instances.length;
      let lost = 0;
      s.onConnectionLost = () => lost++;
      FakeWebSocket.instances.at(-1)!.close();
      // Backoff doubles: 500,1000,2000,4000,8000... total for 8 retries > 25s
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(2000);
        const latest = FakeWebSocket.instances.at(-1)!;
        if (latest.readyState === 0) latest.close(); // every reconnect fails
      }
      const attempts = FakeWebSocket.instances.length - before;
      expect(attempts).toBeLessThanOrEqual(9); // retry budget respected
      expect(lost).toBe(1); // reported once, not per attempt
    } finally {
      vi.useRealTimers();
    }
  });
});

