import type {
  RtpCapabilities,
  TransportOptions,
  DtlsParameters,
  ServerResponse,
  ServerPush,
  ConsumerOptions,
} from "@visio/shared";

type PushHandler = (push: ServerResponse) => void;

const MAX_RETRIES = 8;

export class Signal {
  private url: string;
  private ws!: WebSocket;
  private nextRequestId = 1;
  private manualClose = false;
  private retries = 0;
  private pending = new Map<
    number,
    { resolve: (data: Record<string, unknown>) => void; reject: (e: Error) => void; type?: string }
  >();
  private pushHandlers = new Set<PushHandler>();
  private openResolve!: () => void;
  readonly opened: Promise<void>;

  /** Set by RoomClient: re-attach to the server-side session after a drop. */
  onResume: (() => Promise<void>) | null = null;
  onConnectionLost: (() => void) | null = null;
  onRestored: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.opened = new Promise((resolve) => (this.openResolve = resolve));
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      const wasRetry = this.retries > 0;
      this.retries = 0;
      if (wasRetry && this.onResume) {
        // Re-attach to the server session before letting requests flow.
        this.onResume()
          .then(() => {
            this.onRestored?.();
            this.openResolve();
          })
          .catch(() => {
            // Session expired server-side; closing triggers the retry loop,
            // which eventually gives up and leaves the UI in "lost" state.
            this.manualClose = true;
            this.ws.close();
            this.onConnectionLost?.();
          });
        return;
      }
      this.openResolve();
    };
    this.ws.onerror = () => {
      /* close event follows */
    };
    this.ws.onmessage = (ev) => this.onMessage(String(ev.data));
    this.ws.onclose = () => {
      for (const p of this.pending.values()) p.reject(new Error("connection closed"));
      this.pending.clear();
      if (this.manualClose) return;

      if (this.retries === 0) this.onConnectionLost?.();
      this.retries++;
      if (this.retries > MAX_RETRIES) {
        console.error("[signal] reconnect attempts exhausted");
        return;
      }
      const delay = Math.min(8000, 500 * 2 ** (this.retries - 1));
      setTimeout(() => this.connect(), delay);
    };
  }

  /** Force-drop the socket (tests / manual reconnect). */
  drop(): void {
    this.ws.close();
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
      this.pending.set(requestId, { resolve, reject, type });
      this.ws.send(JSON.stringify({ type, requestId, ...payload }));
    });
  }

  close(): void {
    this.manualClose = true;
    this.ws.close();
  }
}

export type { RtpCapabilities, TransportOptions, DtlsParameters, ConsumerOptions };

