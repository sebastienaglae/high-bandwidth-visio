import { describe, it, vi, beforeEach } from "vitest";
import { Signal } from "../src/signal.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    console.log("ws created:", this.url, "total:", FakeWebSocket.instances.length);
  }
  send(data: string) { this.sent.push(data); }
  close() { console.log("ws close() called"); this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
}
vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);

describe("debug2", () => {
  beforeEach(() => { FakeWebSocket.instances.length = 0; });
  it("probe2", async () => {
    const s = new Signal("ws://x/ws");
    const w = FakeWebSocket.instances.at(-1)!;
    w.open();
    s.onResume = async () => {};
    w.close();
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    console.log("after 2s: len =", FakeWebSocket.instances.length, "elapsed =", Date.now() - start);
  });
});
