// Server base URL handling. In the browser the API is same-origin; in the
// packaged desktop app the SFU lives at a user-configured origin.

const isDesktop = "__TAURI_INTERNALS__" in window;

let serverBase = "";

export function desktopMode(): boolean {
  return isDesktop;
}

export function getServerBase(): string {
  return serverBase;
}

export async function initServerBase(): Promise<string> {
  if (!isDesktop) return "";
  const g = window as unknown as {
    __TAURI__?: { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
  };
  try {
    serverBase = ((await g.__TAURI__!.core!.invoke("get_server_url")) as string) ?? "";
  } catch {
    serverBase = "";
  }
  if (!serverBase) serverBase = localStorage.getItem("visio:server") ?? "";
  return serverBase;
}

export function setServerBase(url: string): void {
  serverBase = url.replace(/\/+$/, "");
  localStorage.setItem("visio:server", serverBase);
}

export function apiUrl(path: string): string {
  return `${serverBase}${path}`;
}

/** ws(s):// endpoint for signaling on the configured or current origin. */
export function wsUrl(path = "/ws"): string {
  if (serverBase) return `${serverBase.replace(/^http/, "ws")}${path}`;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
