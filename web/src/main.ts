import { RoomClient } from "./room.js";
import type { RemoteStream } from "./room.js";
import { NetPanel } from "./netpanel.js";
import { icon } from "./icons.js";
import {
  apiUrl,
  desktopMode,
  getServerBase,
  initServerBase,
  setServerBase,
  wsUrl,
} from "./env.js";
import { t, setLang, getLang, allLangs, MODE_LABELS } from "./i18n.js";
import { MODE_PROFILES, MODES } from "@visio/shared";
import type { Mode, WBOp } from "@visio/shared";
import "./style.css";

const app = document.getElementById("app") as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

const savedName = localStorage.getItem("visio:name") ?? "";
const savedMode = localStorage.getItem("visio:mode") ?? "balanced";

// Desktop (Tauri) builds connect to a configured SFU instead of same-origin.
const isDesktop = desktopMode();

// ---------- Theme & language ----------

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("visio:theme", theme);
}

function themeToggleButton(): HTMLButtonElement {
  const btn = el("button", { class: "control", title: t("theme"), "aria-label": t("theme") });
  const render = (): void => {
    btn.replaceChildren(icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon"));
  };
  btn.onclick = () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    render();
  };
  render();
  return btn;
}

function langSelector(): HTMLSelectElement {
  const sel = el("select", { class: "lang-select", "aria-label": "Language" });
  for (const l of allLangs()) {
    const opt = el("option", { value: l }, l.toUpperCase());
    if (l === getLang()) opt.selected = true;
    sel.append(opt);
  }
  sel.onchange = () => {
    setLang(sel.value as ReturnType<typeof getLang>);
    renderCurrentRoute();
  };
  return sel;
}

let currentRouteRender: () => void = () => renderLanding();

function renderCurrentRoute(): void {
  currentRouteRender();
}

// ---------- Landing ----------

function renderLanding(): void {
  currentRouteRender = renderLanding;
  document.title = "visio";
  const nameInput = el("input", {
    type: "text",
    placeholder: t("namePlaceholder"),
    maxlength: "32",
    value: savedName,
    id: "name",
  });
  const tokenInput = el("input", {
    type: "text",
    placeholder: t("codePlaceholder"),
    id: "code",
  });

  const createBtn = el("button", { class: "primary" }, t("createRoom"));
  createBtn.onclick = async () => {
    if (nameInput.value.trim()) localStorage.setItem("visio:name", nameInput.value.trim());
    createBtn.disabled = true;
    try {
      const res = await fetch(apiUrl("/api/new-room"));
      const { roomId } = (await res.json()) as { roomId: string };
      location.href = `/j/${roomId}`;
    } catch {
      createBtn.disabled = false;
      createBtn.textContent = isDesktop ? t("setServerFirst") : t("serverUnreachable");
      setTimeout(() => (createBtn.textContent = t("createRoom")), 2000);
    }
  };

  const joinBtn = el("button", {}, t("join"));
  joinBtn.onclick = () => {
    let code = tokenInput.value.trim();
    try {
      const url = new URL(code);
      code = url.pathname.split("/").pop() ?? "";
    } catch {
      /* raw token */
    }
    if (/^[A-Za-z0-9_-]{16,64}$/.test(code)) {
      if (nameInput.value.trim()) localStorage.setItem("visio:name", nameInput.value.trim());
      location.href = `/j/${code}`;
    }
  };
  tokenInput.addEventListener("keydown", (e) => e.key === "Enter" && joinBtn.click());

  const topBar = el(
    "div",
    { class: "top-bar" },
    langSelector(),
    themeToggleButton()
  );

  const landing = el(
    "main",
    { class: "landing" },
    topBar,
    el("h1", { class: "wordmark" }, "visio", el("em", {}, ".")),
    el("p", { class: "tagline" }, t("tagline")),
    el("div", { class: "card" },
      nameInput,
      createBtn,
      el("div", { class: "divider" }, t("or")),
      tokenInput,
      joinBtn
    )
  );

  if (isDesktop) {
    void initServerBase().then(() => {
      const serverInput = el("input", {
        type: "text",
        placeholder: "https://your-sfu.example.com",
        value: getServerBase(),
        title: "SFU",
      });
      const saveBtn = el("button", {}, t("save"));
      const status = el("span", { class: "tagline" });

      async function checkAndSave(): Promise<void> {
        const url = serverInput.value.trim().replace(/\/+$/, "");
        if (!url) return;
        try {
          const res = await fetch(`${url}/healthz`);
          if (!res.ok) throw new Error(String(res.status));
          const hw = await gInvoke<{ os: string; cpu: string; gpus: { name: string }[] }>("hardware_info");
          setServerBase(url);
          void gInvoke("set_server_url", { url }).catch(() => undefined);
          status.textContent = `${hw.os.split(" ").slice(0, 2).join(" ")} · ${hw.cpu} · ${hw.gpus[0]?.name ?? "-"}`;
        } catch (e) {
          status.textContent = `${t("serverUnreachable")}: ${(e as Error).message}`;
        }
      }
      saveBtn.onclick = () => void checkAndSave();
      serverInput.addEventListener("keydown", (ev) => ev.key === "Enter" && checkAndSave());

      landing.append(
        el("div", { class: "card desktop-card" },
          el("div", { class: "row gap full" }, serverInput, saveBtn),
          status
        )
      );
      if (getServerBase()) void checkAndSave();
    });
  }

  app.replaceChildren(landing);
}

async function gInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const g = window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } };
  return (await g.__TAURI__!.core!.invoke(cmd, args)) as T;
}

// ---------- Error screen ----------

function renderError(title: string, detail: string): void {
  currentRouteRender = () => renderError(title, detail);
  const backBtn = el("button", { class: "primary" }, t("backHome"));
  backBtn.onclick = () => (location.href = "/");
  app.replaceChildren(
    el("main", { class: "landing" },
      el("div", { class: "top-bar" }, langSelector(), themeToggleButton()),
      el("h1", { class: "wordmark" }, title),
      el("p", { class: "tagline" }, detail),
      backBtn
    )
  );
}

// ---------- Pre-join ----------

async function renderPreJoin(roomId: string): Promise<void> {
  currentRouteRender = () => void renderPreJoin(roomId);
  document.title = t("joinRoom");
  const preview = el("video", { autoplay: "", muted: "", playsinline: "" });
  const nameInput = el("input", {
    type: "text",
    placeholder: t("namePlaceholder"),
    maxlength: "32",
    value: savedName,
  });
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    preview.srcObject = stream;
  } catch {
    // Camera may be denied; still allow join.
  }

  let micOn = true;
  let camOn = true;
  const micBtn = el("button", { class: "icon-toggle", title: t("toggleMic"), "aria-label": t("toggleMic") }, icon("mic"));
  const camBtn = el("button", { class: "icon-toggle", title: t("toggleCam"), "aria-label": t("toggleCam") }, icon("cam"));
  micBtn.onclick = () => {
    micOn = !micOn;
    micBtn.classList.toggle("off", !micOn);
    micBtn.replaceChildren(icon(micOn ? "mic" : "mic-off"));
    stream?.getAudioTracks().forEach((tr) => (tr.enabled = micOn));
  };
  camBtn.onclick = () => {
    camOn = !camOn;
    camBtn.classList.toggle("off", !camOn);
    camBtn.replaceChildren(icon(camOn ? "cam" : "cam-off"));
    stream?.getVideoTracks().forEach((tr) => (tr.enabled = camOn));
  };

  const joinBtn = el("button", { class: "primary" }, t("joinRoom"));
  joinBtn.onclick = () => {
    const name = nameInput.value.trim() || t("guest");
    localStorage.setItem("visio:name", name);
    stream?.getTracks().forEach((tr) => tr.stop()); // re-captured after join
    void startRoom(roomId, name);
  };

  app.replaceChildren(
    el("main", { class: "prejoin" },
      el("div", { class: "top-bar" }, langSelector(), themeToggleButton()),
      el("div", { class: "preview-wrap" }, preview),
      el("div", { class: "card row" },
        nameInput,
        el("div", { class: "row gap" }, micBtn, camBtn),
        joinBtn
      )
    )
  );
}

// ---------- Room ----------

interface Tile {
  root: HTMLDivElement;
  video: HTMLVideoElement;
  audio: HTMLAudioElement | null;
  label: HTMLDivElement;
}

async function startRoom(roomId: string, displayName: string): Promise<void> {
  try {
    await startRoomInner(roomId, displayName);
  } catch (e) {
    console.error("room failed:", e);
    renderError(t("couldNotJoin"), e instanceof Error ? e.message : t("unexpected"));
  }
}

async function startRoomInner(roomId: string, displayName: string): Promise<void> {
  currentRouteRender = () => void startRoom(roomId, displayName);
  document.title = roomId.slice(0, 6) + "…";
  const tiles = new Map<string, Tile>();
  const grid = el("div", { class: "grid", id: "grid" });

  let currentProfile = MODE_PROFILES[savedMode as Mode] ?? MODE_PROFILES.balanced;

  function tileKey(peerId: string, keySuffix: string): string {
    return `${peerId}:${keySuffix}`;
  }

  function applyJitter(target: Element & { jitterBufferTarget?: number | null }): void {
    try {
      target.jitterBufferTarget = currentProfile.jitterBufferTargetMs;
    } catch {
      /* not supported */
    }
  }

  function tileFor(peerId: string, keySuffix: string, labelText: string): Tile {
    const key = tileKey(peerId, keySuffix);
    let tile = tiles.get(key);
    if (!tile) {
      const video = el("video", { autoplay: "", playsinline: "" });
      applyJitter(video as never);
      const label = el("div", { class: "label" }, labelText);
      const root = el("div", { class: "tile" }, video, label);
      grid.append(root);
      tile = { root, video, audio: null, label };
      tiles.set(key, tile);
    }
    return tile;
  }

  function removeTile(key: string): void {
    const tile = tiles.get(key);
    if (!tile) return;
    tile.root.remove();
    tiles.delete(key);
  }

  const peerNames = new Map<string, string>();
  const client = new RoomClient(wsUrl("/ws"), roomId, displayName);

  client.onRemoteStream = (s: RemoteStream) => {
    const isSelf = s.peerId === client.peerId;
    const name = isSelf ? `${displayName} (${t("you")})` : peerNames.get(s.peerId) ?? t("guest");
    const suffix = s.source === "screen" ? ` — ${t("screenSuffix")}` : "";
    const tile = tileFor(s.peerId, s.key, `${name}${suffix}`);

    if (s.kind === "video") {
      tile.video.srcObject = s.stream;
      tile.video.muted = isSelf || s.source === "screen";
      if (isSelf && s.key === "cam") tile.video.style.transform = "scaleX(-1)";
      // Stop button on our own screen shares.
      if (isSelf && s.source === "screen" && !tile.label.querySelector("button")) {
        const stop = el("button", { class: "label-btn", title: "×" });
        stop.replaceChildren(icon("x", 12));
        stop.onclick = () => client.stopScreenShare(s.key.split(":")[1]);
        tile.label.append(stop);
      }
    } else if (!isSelf && !tile.audio) {
      const audio = el("audio", { autoplay: "" });
      applyJitter(audio as never);
      audio.srcObject = s.stream;
      audio.style.display = "none";
      tile.root.append(audio);
      tile.audio = audio;
    }
  };

  client.onRemoteStreamRemoved = (peerId, source, _kind, producerId) => {
    removeTile(tileKey(peerId, source === "screen" ? `screen:${producerId}` : "cam"));
  };

  function relabel(peerId: string): void {
    for (const [key, tile] of tiles) {
      if (!key.startsWith(`${peerId}:`)) continue;
      const name =
        peerId === client.peerId ? `${displayName} (${t("you")})` : peerNames.get(peerId) ?? t("guest");
      tile.label.textContent = key.includes(":screen:") ? `${name} — ${t("screenSuffix")}` : name;
    }
  }

  client.onPeerJoined = (peerId, name) => {
    peerNames.set(peerId, name);
    relabel(peerId);
  };

  client.onPeerLeft = (peerId) => {
    for (const key of [...tiles.keys()]) {
      if (key.startsWith(`${peerId}:`)) removeTile(key);
    }
    peerNames.delete(peerId);
  };

  // ---- Local media + self view ----
  const localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: Math.min(currentProfile.maxHeight ? (currentProfile.maxHeight * 16) / 9 : 3840, 3840) },
      height: { ideal: currentProfile.maxHeight ?? 2160 },
      frameRate: { ideal: currentProfile.maxFps ?? 60 },
    },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const selfTile = tileFor("self", "cam", `${displayName} (${t("you")})`);
  selfTile.video.srcObject = new MediaStream(localStream.getVideoTracks());
  selfTile.video.muted = true;
  selfTile.video.style.transform = "scaleX(-1)";

  await client.join();
  await client.publish(localStream);
  await client.initDataChannel();

  // ---- Mode selector ----
  const modeBar = el("div", { class: "mode-bar" });
  const modeButtons = new Map<Mode, HTMLButtonElement>();
  function selectMode(mode: Mode): void {
    currentProfile = MODE_PROFILES[mode];
    localStorage.setItem("visio:mode", mode);
    for (const [m, btn] of modeButtons) btn.classList.toggle("active", m === mode);
    void client.applyMode(currentProfile);
    for (const tl of tiles.values()) {
      applyJitter(tl.video as never);
      if (tl.audio) applyJitter(tl.audio as never);
    }
  }
  for (const m of MODES) {
    const p = MODE_PROFILES[m];
    const btn = el("button", { class: "mode-btn", title: `${p.label} · ${p.description}` },
      MODE_LABELS[getLang()][m] ?? p.label);
    btn.onclick = () => selectMode(m);
    modeButtons.set(m, btn);
    modeBar.append(btn);
  }

  // ---- Controls ----
  let micOn = true;
  let camOn = true;
  const micBtn = iconControl("mic", "mic-off", t("mic"), true);
  const camBtn = iconControl("cam", "cam-off", t("cam"), true);
  const screenBtn = iconControl("screen", "screen", t("shareScreen"), false);
  const chatBtn = iconControl("chat", "chat", t("chatTitle"), false);
  const boardBtn = iconControl("pen", "pen", t("boardTitle"), false);
  const copyBtn = iconControl("link", "check", t("invite"), false);
  const netBtn = iconControl("activity", "activity", t("netDiagnostics"), false);
  const leaveBtn = iconControl("leave", "leave", t("leave"), false, "danger");
  const roomMain = el("main", { class: "room" });

  micBtn.onclick = () => {
    micOn = !micOn;
    setIconControl(micBtn, micOn, "mic", "mic-off");
    client.setTrackEnabled("audio", micOn);
  };
  camBtn.onclick = () => {
    camOn = !camOn;
    setIconControl(camBtn, camOn, "cam", "cam-off");
    client.setTrackEnabled("video", camOn);
  };

  // Multiple simultaneous screens: every click adds one more share.
  screenBtn.onclick = async () => {
    const producerId = await client.startScreenShare();
    if (!producerId) return;
    const track = client.getScreenStream(producerId)?.getVideoTracks()[0];
    const selfName = `${displayName} (${t("you")})`;
    const tile = tileFor(client.peerId || "self", `screen:${producerId}`, `${selfName} — ${t("screenSuffix")}`);
    if (track) {
      tile.video.srcObject = new MediaStream([track]);
      tile.video.muted = true;
      track.addEventListener("ended", () =>
        removeTile(tileKey(client.peerId || "self", `screen:${producerId}`))
      );
    }
  };

  copyBtn.onclick = () => {
    const invite = getServerBase() ? `${getServerBase()}/j/${roomId}` : location.href;
    void navigator.clipboard.writeText(invite);
    copyBtn.replaceChildren(icon("check"));
    setTimeout(() => copyBtn.replaceChildren(icon("link")), 1500);
  };

  let netPanel: NetPanel | null = null;
  netBtn.onclick = () => {
    if (netPanel) return;
    setIconControl(netBtn, true, "activity");
    netPanel = new NetPanel(client, () => {
      netPanel = null;
      setIconControl(netBtn, false, "activity");
    });
    roomMain.append(netPanel.element);
  };

  leaveBtn.onclick = () => {
    client.close();
    location.href = "/";
  };

  // ---- Chat + temporary file sharing ----
  const chat = buildChatPanel(client, displayName, peerNames, () => {
    setIconControl(chatBtn, false, "chat");
  });
  chatBtn.onclick = () => {
    const open = !chat.root.classList.contains("hidden");
    chat.root.classList.toggle("hidden", open);
    setIconControl(chatBtn, !open, "chat");
  };

  // ---- Whiteboard ----
  const board = buildWhiteboard(client);
  boardBtn.onclick = () => {
    const open = !board.overlay.classList.contains("hidden");
    board.overlay.classList.toggle("hidden", open);
    setIconControl(boardBtn, !open, "pen");
  };

  // ---- Idle fade ----
  let idleTimer = 0;
  const wake = (): void => {
    roomMain.classList.remove("idle");
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => roomMain.classList.add("idle"), 4000);
  };
  roomMain.addEventListener("mousemove", wake);
  roomMain.addEventListener("mouseleave", () => roomMain.classList.add("idle"));
  wake();

  window.addEventListener("pagehide", () => client.close(), { once: true });

  roomMain.append(
    grid,
    board.overlay,
    el("footer", { class: "controls" },
      modeBar,
      el("div", { class: "controls-group" },
        micBtn, camBtn, screenBtn, chatBtn, boardBtn, copyBtn, netBtn,
        themeToggleButton(),
        leaveBtn
      )
    ),
    chat.root
  );

  app.replaceChildren(roomMain);

  const initialMode = (MODES as readonly string[]).includes(savedMode)
    ? (savedMode as Mode)
    : "balanced";
  selectMode(initialMode);
}

function iconControl(
  onIcon: string,
  offIcon: string,
  label: string,
  initialOn: boolean,
  extraClass?: string
): HTMLButtonElement {
  const btn = el("button", {
    class: `control${extraClass ? ` ${extraClass}` : ""}`,
    title: label,
    "aria-label": label,
  });
  btn.replaceChildren(icon(initialOn ? onIcon : offIcon));
  btn.dataset.onIcon = onIcon;
  btn.dataset.offIcon = offIcon;
  return btn;
}

function setIconControl(btn: HTMLButtonElement, on: boolean, ..._rest: string[]): void {
  btn.classList.toggle("off", !on);
  btn.replaceChildren(icon(on ? btn.dataset.onIcon! : (btn.dataset.offIcon ?? btn.dataset.onIcon!)));
}

// ---------- Chat panel + temporary files ----------

interface FileIncoming {
  name: string;
  size: number;
  chunks: Uint8Array[];
  received: number;
}

const FILE_TAG = 0xf1;

function buildChatPanel(
  client: RoomClient,
  displayName: string,
  peerNames: Map<string, string>,
  onClose: () => void
): { root: HTMLElement } {
  const root = el("aside", { class: "side-panel chat-panel hidden" });
  const messages = el("div", { class: "chat-messages" });
  const input = el("input", { type: "text", placeholder: t("chatPlaceholder"), maxlength: "2000" });
  const fileInput = el("input", { type: "file", multiple: "" }) as HTMLInputElement;
  fileInput.style.display = "none";

  const sendBtn = el("button", { class: "control small", title: t("send"), "aria-label": t("send") }, icon("send", 16));
  const attachBtn = el("button", { class: "control small", title: t("attachFile"), "aria-label": t("attachFile") }, icon("file", 16));

  const closeBtn = el("button", { class: "panel-close", "aria-label": "close" }, "×");
  const head = el("div", { class: "panel-head" }, el("span", {}, t("chatTitle")), closeBtn);

  root.append(head, messages, el("div", { class: "row gap full chat-input-row" }, attachBtn, input, sendBtn), fileInput);
  closeBtn.onclick = () => {
    root.classList.add("hidden");
    onClose();
  };

  const sendText = (): void => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage(displayName, text, true);
    client.sendApp(JSON.stringify({ t: "chat", name: displayName, text, ts: Date.now() }));
  };
  sendBtn.onclick = sendText;
  input.addEventListener("keydown", (e) => e.key === "Enter" && sendText());

  attachBtn.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    for (const file of Array.from(fileInput.files ?? [])) {
      await sendFile(file);
    }
    fileInput.value = "";
  };

  async function sendFile(file: File): Promise<void> {
    const id = crypto.randomUUID();
    addSystem(`${displayName} ${t("fileArrives")}: ${file.name}`);
    client.sendApp(JSON.stringify({ t: "fmeta", id, name: file.name, size: file.size, mime: file.type }));
    const CHUNK = 60 * 1024;
    let seq = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      const slice = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
      const frame = new Uint8Array(1 + 36 + 4 + slice.length);
      frame[0] = FILE_TAG;
      frame.set(new TextEncoder().encode(id), 1);
      new DataView(frame.buffer).setUint32(37, seq, false);
      frame.set(slice, 41);
      while ((client.appBufferedAmount ?? 0) > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 25)); // SCTP backpressure
      }
      client.sendApp(frame.buffer);
      seq++;
    }
    client.sendApp(JSON.stringify({ t: "fend", id }));
  }

  function downloadChip(name: string, blobUrl: string, sizeLabel: string): HTMLElement {
    const a = el("a", { class: "file-chip", href: blobUrl, download: name }, icon("file", 14));
    a.append(el("span", {}, `${name} · ${sizeLabel}`), el("strong", {}, t("download")));
    return a;
  }

  function fmtSize(n: number): string {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
  }

  function addLine(node: HTMLElement): void {
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(name: string, text: string, self: boolean): void {
    const line = el("div", { class: `msg${self ? " self" : ""}` },
      el("span", { class: "msg-name" }, name),
      el("span", {}, text)
    );
    addLine(line);
  }

  function addSystem(text: string): void {
    addLine(el("div", { class: "msg system" }, el("span", {}, text)));
  }

  const incomingFiles = new Map<string, FileIncoming>();

  client.onAppMessage = (peerId, data) => {
    const name = peerNames.get(peerId) ?? t("guest");
    if (typeof data === "string") {
      let env: { t?: string; name?: string; text?: string; ts?: number; id?: string; size?: number };
      try {
        env = JSON.parse(data);
      } catch {
        return;
      }
      if (env.t === "chat") {
        addMessage(env.name ?? name, String(env.text ?? "").slice(0, 2000), false);
      } else if (env.t === "fmeta" && env.id) {
        incomingFiles.set(env.id, {
          name: String(env.name ?? "file").slice(0, 120),
          size: Number(env.size ?? 0),
          chunks: [],
          received: 0,
        });
        addSystem(`${name}: ${env.name ?? ""} — ${t("receivingFile")}…`);
      } else if (env.t === "fend" && env.id) {
        const f = incomingFiles.get(env.id);
        if (!f) return;
        const blob = new Blob(f.chunks as BlobPart[]);
        const url = URL.createObjectURL(blob);
        incomingFiles.delete(env.id);
        addLine(downloadChip(f.name, url, fmtSize(blob.size)));
      }
      return;
    }
    // Binary: file chunk frame
    const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!buf || buf.length < 41 || buf[0] !== FILE_TAG) return;
    const id = new TextDecoder().decode(buf.subarray(1, 37));
    const f = incomingFiles.get(id);
    if (!f) return; // chunk before meta: drop
    const payload = buf.subarray(41);
    f.chunks.push(payload);
    f.received += payload.length;
  };

  return { root };
}

// ---------- Whiteboard ----------

function buildWhiteboard(client: RoomClient): { overlay: HTMLDivElement } {
  const overlay = el("div", { class: "board-overlay hidden" });
  const canvas = el("canvas", { class: "board-canvas" }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const colors = ["#292520", "#d97757", "#5b7a9d", "#6b7f3e", "#f6f2ec"];
  const widths = [2, 4, 8];
  let color = colors[1];
  let width = widths[1];

  const toolbar = el("div", { class: "board-toolbar" });
  toolbar.append(el("span", { class: "board-title" }, t("boardTitle")));

  const swatches = colors.map((c) => {
    const b = el("button", { class: "swatch", title: t("boardPen") });
    b.style.background = c;
    if (c === color) b.classList.add("active");
    b.onclick = () => {
      color = c;
      toolbar.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
      b.classList.add("active");
    };
    return b;
  });
  toolbar.append(...swatches);

  for (const w of widths) {
    const b = el("button", { class: `width-btn${w === width ? " active" : ""}`, title: `${w}px` });
    const dot = el("span") as HTMLSpanElement;
    dot.className = "dot";
    dot.style.width = dot.style.height = `${w * 2}px`;
    b.append(dot);
    b.onclick = () => {
      width = w;
      toolbar.querySelectorAll(".width-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
    toolbar.append(b);
  }

  const clearBtn = el("button", { class: "control small", title: t("boardClear") }, icon("trash", 15));
  clearBtn.onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.clear();
    void client.signal.request("wbClear");
  };
  const closeBtn = el("button", { class: "control small", title: "close" }, icon("x", 15));
  closeBtn.onclick = () => {
    overlay.classList.add("hidden");
  };
  toolbar.append(clearBtn, closeBtn);

  overlay.append(canvas, toolbar);

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      canvas.width = Math.round(rect.width * devicePixelRatio);
      canvas.height = Math.round(rect.height * devicePixelRatio);
    }
  }
  new ResizeObserver(resize).observe(canvas);

  interface LiveStroke {
    color: string;
    width: number;
    points: number[];
  }
  const strokes = new Map<string, LiveStroke>();

  function drawSegment(pts: number[], strokeColor: string, w: number): void {
    if (pts.length < 4) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w * devicePixelRatio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0] * canvas.width, pts[1] * canvas.height);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i] * canvas.width, pts[i + 1] * canvas.height);
    }
    ctx.stroke();
  }

  function applyOps(ops: WBOp[]): void {
    for (const op of ops) {
      if (op.k === "clear") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes.clear();
      } else if (op.k === "start") {
        strokes.set(op.s.id, { color: op.s.color, width: op.s.width, points: [...op.pts] });
        drawSegment(op.pts, op.s.color, op.s.width);
      } else if (op.k === "pts") {
        const s = strokes.get(op.id);
        if (!s) continue;
        drawSegment([...s.points.slice(-2), ...op.pts], s.color, s.width);
        s.points.push(...op.pts);
      } else if (op.k === "end") {
        strokes.delete(op.id);
      }
    }
  }
  client.onWbOps = applyOps;

  // Local drawing
  let drawing: LiveStroke | null = null;
  let drawingId = "";
  let pendingPts: number[] = [];
  let flushTimer = 0;

  function toLocal(e: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawingId = crypto.randomUUID();
    const [x, y] = toLocal(e);
    drawing = { color, width, points: [x, y] };
    pendingPts = [x, y];
    strokes.set(drawingId, drawing);
    drawSegment([x, y, x + 0.0001, y], color, width);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const [x, y] = toLocal(e);
    const last = drawing.points;
    drawSegment([last.at(-2)!, last.at(-1)!, x, y], drawing.color, drawing.width);
    drawing.points.push(x, y);
    pendingPts.push(x, y);
  });

  function flush(): void {
    if (!drawing || pendingPts.length === 0) return;
    const first = strokes.get(drawingId) === drawing && pendingPts.length === drawing.points.length
      ? [{ k: "start" as const, s: { id: drawingId, color: drawing.color, width: drawing.width }, pts: pendingPts }]
      : [{ k: "pts" as const, id: drawingId, pts: pendingPts }];
    void client.signal.request("wbOp", { ops: first });
    pendingPts = [];
  }

  setInterval(() => flush(), 50);

  canvas.addEventListener("pointerup", () => {
    flush();
    if (drawing) {
      void client.signal.request("wbOp", { ops: [{ k: "end", id: drawingId }] });
      drawing = null;
      pendingPts = [];
    }
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = null;
    pendingPts = [];
  });

  return { overlay };
}

// ---------- Router ----------

const path = location.pathname;
if (path.startsWith("/j/")) {
  const roomId = path.slice(3);
  if (/^[A-Za-z0-9_-]{16,64}$/.test(roomId)) {
    void renderPreJoin(roomId);
  } else {
    renderLanding();
  }
} else {
  renderLanding();
}
