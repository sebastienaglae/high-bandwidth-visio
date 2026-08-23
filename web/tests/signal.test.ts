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

beforeEach(() => FakeWebSocket.instances.length === 0);
afterEach(() => {
  FakeWebSocket.instances.length = 0;
});

function makeSignal(): { signal: Signal; ws: FakeWebSocket } {
  const signal = new Signal("ws://test/ws");
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
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
    void signal.request("a");
    void signal.request("b");
    expect(JSON.parse(ws.sent[0]).requestId).toBe(1);
    expect(JSON.parse(ws.sent[1]).requestId).toBe(2);
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
    ws.close();
    await expect(p).rejects.toThrow("connection closed");
  });

  it("resolves opened once the socket is live", async () => {
    const s2 = new Signal("ws://test2/ws");
    const w2 = FakeWebSocket.instances.at(-1)!;
    const done = vi.fn();
    s2.opened.then(done);
    expect(done).not.toHaveBeenCalled();
    w2.open();
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
  });
});
