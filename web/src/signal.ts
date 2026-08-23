import type {
  RtpCapabilities,
  TransportOptions,
  DtlsParameters,
  ServerResponse,
  ServerPush,
  ConsumerOptions,
} from "@visio/shared";

type PushHandler = (push: ServerResponse) => void;

export class Signal {
  private ws: WebSocket;
  private nextRequestId = 1;
  private pending = new Map<
    number,
    { resolve: (data: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  private pushHandlers = new Set<PushHandler>();
  readonly opened: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("websocket connection failed"));
    });
    this.ws.onmessage = (ev) => this.onMessage(String(ev.data));
    this.ws.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error("connection closed"));
      this.pending.clear();
    };
  }

  private onMessage(raw: string): void {
    const msg = JSON.parse(raw) as ServerResponse;
    if (msg.type === "response") {
      const entry = this.pending.get(msg.requestId);
      if (entry) {
        this.pending.delete(msg.requestId);
        entry.resolve(msg.data);
      }
      return;
    }
    if (msg.type === "error") {
      if (typeof msg.requestId === "number") {
        const entry = this.pending.get(msg.requestId);
        if (entry) {
          this.pending.delete(msg.requestId);
          entry.reject(new Error(msg.message));
        }
      } else {
        console.error("server error:", msg.message);
      }
      return;
    }
    for (const h of this.pushHandlers) h(msg as ServerPush);
  }

  onPush(handler: PushHandler): () => void {
    this.pushHandlers.add(handler);
    return () => this.pushHandlers.delete(handler);
  }

  request(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify({ type, requestId, ...payload }));
    });
  }

  close(): void {
    this.ws.close();
  }
}

export type { RtpCapabilities, TransportOptions, DtlsParameters, ConsumerOptions };
