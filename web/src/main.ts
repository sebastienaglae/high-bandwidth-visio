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
import { listAudioVideoDevices, pickDevice, deviceLabel } from "./devices.js";
import { pickDominant } from "./layout.js";
import { playCue } from "./audio.js";
import { MODE_PROFILES, MODES } from "@visio/shared";
import type { Mode, WBOp, IceServer } from "@visio/shared";
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
  let micOn = true;
  let camOn = true;
  const micBtn = el("button", { class: "icon-toggle", title: t("toggleMic"), "aria-label": t("toggleMic") }, icon("mic"));
  const camBtn = el("button", { class: "icon-toggle", title: t("toggleCam"), "aria-label": t("toggleCam") }, icon("cam"));

  async function acquire(): Promise<MediaStream | null> {
    const cams = (await listAudioVideoDevices().catch(() => ({ cams: [], mics: [] }))).cams;
    const mics = (await listAudioVideoDevices().catch(() => ({ cams: [], mics: [] }))).mics;
    const camId = pickDevice(cams, localStorage.getItem("visio:camId"));
    const micId = pickDevice(mics, localStorage.getItem("visio:micId"));
    const video: MediaTrackConstraints = {
      ...(camId ? { deviceId: { exact: camId } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    const audio: MediaTrackConstraints = {
      ...(micId ? { deviceId: { exact: micId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
    };
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        return null;
      }
    }
  }

  stream = await acquire();
  if (stream) preview.srcObject = stream;

  const camSelect = el("select", { class: "device-select", "aria-label": t("selectCamera") });
  const micSelect = el("select", { class: "device-select", "aria-label": t("selectMic") });

  async function populateDevices(): Promise<void> {
    const { cams, mics } = await listAudioVideoDevices().catch(() => ({ cams: [], mics: [] }));
    if (cams.length > 1 || localStorage.getItem("visio:camId")) {
      camSelect.replaceChildren();
      const savedCam = localStorage.getItem("visio:camId");
      cams.forEach((d, i) => {
        const o = el("option", { value: d.deviceId }, deviceLabel(d, i));
        if (d.deviceId === (savedCam ?? stream?.getVideoTracks()[0]?.getSettings().deviceId)) o.selected = true;
        camSelect.append(o);
      });
      camSelect.classList.remove("hidden");
    }
    if (mics.length > 1 || localStorage.getItem("visio:micId")) {
      micSelect.replaceChildren();
      const savedMic = localStorage.getItem("visio:micId");
      mics.forEach((d, i) => {
        const o = el("option", { value: d.deviceId }, deviceLabel(d, i));
        if (d.deviceId === (savedMic ?? stream?.getAudioTracks()[0]?.getSettings().deviceId)) o.selected = true;
        micSelect.append(o);
      });
      micSelect.classList.remove("hidden");
    }
  }
  void populateDevices();

  async function switchDevice(kind: "cam" | "mic", deviceId: string): Promise<void> {
    localStorage.setItem(kind === "cam" ? "visio:camId" : "visio:micId", deviceId);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = await acquire();
    preview.srcObject = stream;
  }
  camSelect.onchange = () => void switchDevice("cam", camSelect.value);
  micSelect.onchange = () => void switchDevice("mic", micSelect.value);

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
      el("div", { class: "card" },
        el("div", { class: "row gap full" }, camSelect, micSelect),
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
  labelText: HTMLSpanElement;
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
      const textSpan = el("span", { class: "label-text" }, labelText);
      const label = el("div", { class: "label" }, textSpan);
      const root = el("div", { class: "tile" }, video, label);
      grid.append(root);
      tile = { root, video, audio: null, label, labelText: textSpan };
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
  const iceServers = await fetch(apiUrl("/api/rtc-config"))
    .then((r) => r.json() as Promise<{ iceServers: IceServer[] }>)
    .then((d) => d.iceServers ?? [])
    .catch(() => [] as IceServer[]);

  const client = new RoomClient(wsUrl("/ws"), roomId, displayName, iceServers);
  let hostPeerId = "";
  // Debug hook: append ?debug to inspect transports/consumers from the console.
  if (new URLSearchParams(location.search).has("debug")) {
    (window as unknown as { __room: RoomClient }).__room = client;
    (window as unknown as { __names: Map<string, string> }).__names = peerNames;
    (window as unknown as { __host: () => string }).__host = () => hostPeerId;
  }

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

    // Pin button on every tile.
    const fullKey = tileKey(s.peerId, s.key);
    if (!tile.label.querySelector(".pin-btn")) {
      const pin = el("button", { class: "label-btn pin-btn", title: t("pin"), "aria-label": t("pin") });
      pin.replaceChildren(icon("pin", 12));
      pin.onclick = (e) => {
        e.stopPropagation();
        pinnedKey = pinnedKey === fullKey ? null : fullKey;
        const pinning = pinnedKey === fullKey;
        pin.title = pinning ? t("unpin") : t("pin");
        if (layout === "grid" && pinning) {
          layout = "speaker";
          localStorage.setItem("visio:layout", layout);
          renderLayoutBtn();
        }
        applyLayout();
      };
      tile.label.append(pin);
    }
    applyLayout();
  };

  client.onRemoteStreamRemoved = (peerId, source, _kind, producerId) => {
    removeTile(tileKey(peerId, source === "screen" ? `screen:${producerId}` : "cam"));
    if (pinnedKey && !tiles.has(pinnedKey)) pinnedKey = null;
    applyLayout();
  };

  function relabel(peerId: string): void {
    for (const [key, tile] of tiles) {
      if (!key.startsWith(`${peerId}:`)) continue;
      const isSelf = peerId === client.peerId || peerId === "self";
      const name = isSelf ? `${displayName} (${t("you")})` : peerNames.get(peerId) ?? t("guest");
      const suffix = key.includes(":screen:") ? ` — ${t("screenSuffix")}` : "";
      const hostTag = hostPeerId === peerId || (isSelf && hostPeerId === client.peerId) ? `${t("host")} · ` : "";
      tile.labelText.textContent = `${hostTag}${name}${suffix}`;
      rebuildTileActions(peerId, key, tile, isSelf);
    }
  }

  /** Host-only per-tile moderation buttons on remote camera tiles. */
  function rebuildTileActions(peerId: string, key: string, tile: Tile, isSelf: boolean): void {
    tile.label.querySelectorAll(".mod-btn").forEach((b) => b.remove());
    if (isSelf || key.includes(":screen:")) return;
    if (hostPeerId !== client.peerId || client.peerId === "") return;

    const muteBtn = el("button", { class: "label-btn mod-btn", title: t("mutePeer"), "aria-label": t("mutePeer") });
    muteBtn.replaceChildren(icon("mic-off", 12));
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      void client.signal.request("moderate", { action: "mute", targetPeerId: peerId });
    };
    const kickBtn = el("button", { class: "label-btn mod-btn danger", title: t("kickPeer"), "aria-label": t("kickPeer") });
    kickBtn.replaceChildren(icon("x", 12));
    kickBtn.onclick = (e) => {
      e.stopPropagation();
      void client.signal.request("moderate", { action: "kick", targetPeerId: peerId });
    };
    tile.label.append(muteBtn, kickBtn);
  }

  function refreshAllLabels(): void {
    for (const peerId of new Set([...tiles.keys()].map((k) => k.split(":")[0]))) {
      relabel(peerId);
    }
  }

  client.onRoleChanged = (peerId, role) => {
    if (role === "host") hostPeerId = peerId;
    else if (hostPeerId === peerId) hostPeerId = "";
    refreshAllLabels();
    lockBtn.classList.toggle("hidden", hostPeerId !== client.peerId);
  };

  // ---- Layout (grid / speaker) + pin ----
  type LayoutMode = "grid" | "speaker";
  let layout: LayoutMode = (localStorage.getItem("visio:layout") as LayoutMode) ?? "grid";
  let pinnedKey: string | null = null;
  let lastSpeakerKey: string | null = null;

  const layoutBtn = el("button", { class: "control", "aria-label": "Layout" });
  function renderLayoutBtn(): void {
    layoutBtn.replaceChildren(icon(layout === "speaker" ? "speaker" : "grid"));
    layoutBtn.title = layout === "speaker" ? t("layoutGrid") : t("layoutSpeaker");
  }
  layoutBtn.onclick = () => {
    layout = layout === "speaker" ? "grid" : "speaker";
    localStorage.setItem("visio:layout", layout);
    renderLayoutBtn();
    applyLayout();
  };
  renderLayoutBtn();

  function applyLayout(): void {
    grid.classList.toggle("layout-speaker", layout === "speaker");
    grid.classList.toggle("layout-grid", layout === "grid");
    const keys = [...tiles.keys()];
    const dominant = layout === "speaker"
      ? pickDominant({ pinned: pinnedKey, lastSpeaker: lastSpeakerKey, tiles: keys })
      : null;
    for (const [key, tile] of tiles) {
      tile.root.classList.toggle("dominant", key === dominant);
      tile.root.classList.toggle("pinned", key === pinnedKey);
    }
  }

  client.onActiveSpeaker = (peerId) => {
    const key = tileKey(peerId, "cam");
    if (tiles.has(key)) lastSpeakerKey = key;
    for (const [k, tile] of tiles) {
      const speaking = k === key;
      tile.root.classList.toggle("speaking", speaking);
      if (speaking) window.setTimeout(() => tile.root.classList.remove("speaking"), 2000);
    }
    if (layout === "speaker" && !pinnedKey) applyLayout();
  };

  client.onModerated = (action, by) => {
    if (action === "mute" && micOn) {
      micOn = false;
      setIconControl(micBtn, micOn, "mic", "mic-off");
      client.setTrackEnabled("audio", false);
      chatSystem(`${t("youWereMuted")} (${by})`);
    }
  };

  client.onKicked = () => {
    client.close();
    renderError(t("kickedTitle"), t("kickedDetail"));
  };

  client.onRoomLocked = () => {
    chatSystem(t("roomNowLocked"));
  };

  client.onQuality = (peerId, key, quality) => {
    const tile = tiles.get(tileKey(peerId, key));
    if (!tile) return;
    tile.root.classList.toggle("q-low", quality === "low");
    tile.root.classList.toggle("q-mid", quality === "mid");
  };

  client.onPeerJoined = (peerId, name) => {
    peerNames.set(peerId, name);
    relabel(peerId);
    playCue("join");
  };

  client.onPeerLeft = (peerId) => {
    for (const key of [...tiles.keys()]) {
      if (key.startsWith(`${peerId}:`)) removeTile(key);
    }
    peerNames.delete(peerId);
    if (pinnedKey && !tiles.has(pinnedKey)) pinnedKey = null;
    applyLayout();
    playCue("leave");
  };

  // ---- Local media + self view ----
  const savedCamId = localStorage.getItem("visio:camId");
  const savedMicId = localStorage.getItem("visio:micId");
  const localStream = await navigator.mediaDevices
    .getUserMedia({
      video: {
        ...(savedCamId ? { deviceId: { exact: savedCamId } } : {}),
        width: {
          ideal: Math.min(currentProfile.maxHeight ? (currentProfile.maxHeight * 16) / 9 : 3840, 3840),
        },
        height: { ideal: currentProfile.maxHeight ?? 2160 },
        frameRate: { ideal: currentProfile.maxFps ?? 60 },
      },
      audio: {
        ...(savedMicId ? { deviceId: { exact: savedMicId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    .catch(() =>
      // Saved device may be gone; retry with defaults.
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      })
    );

  const selfTile = tileFor("self", "cam", `${displayName} (${t("you")})`);
  selfTile.video.srcObject = new MediaStream(localStream.getVideoTracks());
  selfTile.video.muted = true;
  selfTile.video.style.transform = "scaleX(-1)";

  await client.join();
  await client.publish(localStream);
  await client.initDataChannel();
  hostPeerId = client.hostPeerId;

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
  const lockBtn = iconControl("lock", "unlock", t("lockRoom"), false);
  lockBtn.classList.add("hidden"); // guests never see it
  const recBtn = iconControl("stop", "record", t("record"), false);
  const leaveBtn = iconControl("leave", "leave", t("leave"), false, "danger");
  const roomMain = el("main", { class: "room" });

  micBtn.onclick = () => {
    micOn = !micOn;
    setIconControl(micBtn, micOn, "mic", "mic-off");
    client.setTrackEnabled("audio", micOn);
    playCue(micOn ? "unmute" : "mute");
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
  lockBtn.onclick = () => {
    const locking = lockBtn.classList.contains("off"); // off = currently unlocked
    void client.signal.request("moderate", { action: locking ? "lock" : "unlock" });
    setIconControl(lockBtn, locking, "lock");
    lockBtn.title = locking ? t("unlockRoom") : t("lockRoom");
  };

  // ---- Local recording (camera + mic → WebM download) ----
  let recorder: MediaRecorder | null = null;
  let recChunks: Blob[] = [];
  recBtn.onclick = () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!localStream || localStream.getTracks().length === 0) return;
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";
    try {
      recorder = new MediaRecorder(localStream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    } catch (e) {
      console.warn("recorder unavailable:", e);
      return;
    }
    recChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recChunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recChunks, { type: "video/webm" });
      recChunks = [];
      recorder = null;
      setIconControl(recBtn, false, "record");
      if (blob.size === 0) return;
      const url = URL.createObjectURL(blob);
      const name = `visio-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      chat.addDownload(name, url, chatFmtSize(blob.size));
      chat.system(t("recordingSaved"));
    };
    recorder.start(1000);
    setIconControl(recBtn, true, "record");
  };

  // ---- Keyboard shortcuts (ignored while typing) ----
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") micBtn.click();
    else if (e.key === "v" || e.key === "V") camBtn.click();
  });

  const chat = buildChatPanel(client, displayName, peerNames, () => {
    setIconControl(chatBtn, false, "chat");
  });
  const chatSystem = chat.system;
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

  // ---- Reconnect banner ----
  const banner = el("div", { class: "reconnect-banner hidden" }, t("reconnecting"));
  client.signal.onConnectionLost = () => banner.classList.remove("hidden");
  client.signal.onRestored = () => banner.classList.add("hidden");

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
      layoutBtn,
      modeBar,
      el("div", { class: "controls-group" },
        micBtn, camBtn, screenBtn, recBtn, chatBtn, boardBtn, copyBtn, netBtn, lockBtn,
        themeToggleButton(),
        leaveBtn
      )
    ),
    banner,
    chat.root
  );

  app.replaceChildren(roomMain);

  const initialMode = (MODES as readonly string[]).includes(savedMode)
    ? (savedMode as Mode)
    : "balanced";
  selectMode(initialMode);

  // Moderation UI state for this participant's role.
  refreshAllLabels();
  lockBtn.classList.toggle("hidden", hostPeerId !== client.peerId);
  client.startQualityPolling();
}

function chatFmtSize(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
}

function iconControl(
  onIcon: string,
  offIcon: string,
  label: string,
  initialOn: boolean,
  extraClass?: string
): HTMLButtonElement {  const btn = el("button", {
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
): {
  root: HTMLElement;
  system: (text: string) => void;
  addDownload: (name: string, url: string, sizeLabel: string) => void;
} {
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

  // Drag & drop onto the chat panel.
  root.addEventListener("dragover", (e) => {
    e.preventDefault();
    root.classList.add("dragging");
  });
  root.addEventListener("dragleave", () => root.classList.remove("dragging"));
  root.addEventListener("drop", (e) => {
    e.preventDefault();
    root.classList.remove("dragging");
    for (const file of Array.from(e.dataTransfer?.files ?? [])) {
      void sendFile(file);
    }
  });

  // ---- Transfer progress rows ----
  interface TransferRow {
    row: HTMLElement;
    set: (pct: number) => void;
    finish: () => void;
    remove: () => void;
  }
  const transferRows = new Map<string, TransferRow>();

  function progressRow(name: string, id: string, cancellable: boolean): TransferRow {
    const fill = el("div", { class: "transfer-fill" });
    const bar = el("div", { class: "transfer-bar" }, fill);
    const label = el("span", { class: "transfer-label" }, `${name} · 0%`);
    const row = el("div", { class: "msg system transfer" }, label, bar);
    const tr: TransferRow = {
      row,
      set: (pct) => {
        fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        label.textContent = `${name} · ${Math.round(pct)}%`;
      },
      finish: () => {
        fill.style.width = "100%";
        row.remove();
      },
      remove: () => row.remove(),
    };
    if (cancellable) {
      const x = el("button", { class: "label-btn", title: t("cancelTransfer"), "aria-label": t("cancelTransfer") });
      x.replaceChildren(icon("x", 12));
      x.onclick = () => {
        client.sendApp(JSON.stringify({ t: "fcancel", id }));
        cancelledSends.add(id);
        tr.remove();
        addSystem(`${name} — ${t("transferCancelled")}`);
      };
      row.append(x);
    }
    addLine(row);
    transferRows.set(id, tr);
    return tr;
  }

  const cancelledSends = new Set<string>();

  async function sendFile(file: File): Promise<void> {
    const id = crypto.randomUUID();
    const tr = progressRow(file.name, id, true);
    client.sendApp(JSON.stringify({ t: "fmeta", id, name: file.name, size: file.size, mime: file.type }));
    const CHUNK = 60 * 1024;
    let seq = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK) {
      if (cancelledSends.has(id)) {
        cancelledSends.delete(id);
        transferRows.delete(id);
        return;
      }
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
      tr.set((offset + slice.length) / Math.max(1, file.size) * 100);
    }
    client.sendApp(JSON.stringify({ t: "fend", id }));
    tr.finish();
    transferRows.delete(id);
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
        progressRow(`${name}: ${env.name ?? ""}`, env.id, false);
      } else if (env.t === "fend" && env.id) {
        const f = incomingFiles.get(env.id);
        const tr = transferRows.get(env.id);
        if (!f) return;
        const blob = new Blob(f.chunks as BlobPart[]);
        const url = URL.createObjectURL(blob);
        incomingFiles.delete(env.id);
        tr?.finish();
        transferRows.delete(env.id);
        addLine(downloadChip(f.name, url, fmtSize(blob.size)));
      } else if (env.t === "fcancel" && env.id) {
        incomingFiles.delete(env.id);
        transferRows.get(env.id)?.remove();
        transferRows.delete(env.id);
        addSystem(`${name}: ${t("transferCancelled")}`);
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
    transferRows.get(id)?.set((f.received / Math.max(1, f.size)) * 100);
  };

  return {
    root,
    system: addSystem,
    addDownload: (name: string, url: string, sizeLabel: string) => addLine(downloadChip(name, url, sizeLabel)),
  };
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
    history.length = 0;
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
      // Resizing clears the bitmap — replay the full history, then restore
      // the stroke currently being drawn.
      strokes.clear();
      for (const op of history) applyOp(op);
      if (drawing) strokes.set(drawingId, drawing);
    }
  }
  new ResizeObserver(resize).observe(canvas);

  interface LiveStroke {
    color: string;
    width: number;
    points: number[];
  }
  const strokes = new Map<string, LiveStroke>();
  const history: WBOp[] = [];

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

  function applyOp(op: WBOp): void {
    if (op.k === "clear") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.clear();
    } else if (op.k === "start") {
      strokes.set(op.s.id, { color: op.s.color, width: op.s.width, points: [...op.pts] });
      drawSegment(op.pts, op.s.color, op.s.width);
    } else if (op.k === "pts") {
      const s = strokes.get(op.id);
      if (!s) return;
      drawSegment([...s.points.slice(-2), ...op.pts], s.color, s.width);
      s.points.push(...op.pts);
    } else if (op.k === "end") {
      strokes.delete(op.id);
    }
  }

  function applyOps(ops: WBOp[]): void {
    for (const op of ops) {
      history.push(op);
      if (history.length > 4000) history.splice(0, history.length - 4000);
      applyOp(op);
    }
  }
  client.onWbOps = applyOps;

  // Local drawing
  let drawing: LiveStroke | null = null;
  let drawingId = "";
  let pendingPts: number[] = [];
  let startSent = false;
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
    startSent = false;
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
    let ops;
    if (!startSent) {
      // The replay history must begin with a "start" op for this stroke.
      ops = [{ k: "start" as const, s: { id: drawingId, color: drawing.color, width: drawing.width }, pts: pendingPts }];
      startSent = true;
    } else {
      ops = [{ k: "pts" as const, id: drawingId, pts: pendingPts }];
    }
    history.push(...ops);
    void client.signal.request("wbOp", { ops });
    pendingPts = [];
  }

  setInterval(() => flush(), 50);

  canvas.addEventListener("pointerup", () => {
    flush();
    if (drawing) {
      const end = { k: "end" as const, id: drawingId };
      history.push(end);
      void client.signal.request("wbOp", { ops: [end] });
      drawing = null;
      pendingPts = [];
    }
  });
  canvas.addEventListener("pointercancel", () => {
    drawing = null;
    pendingPts = [];
  });

  if (new URLSearchParams(location.search).has("debug")) {
    (window as unknown as { __board: object }).__board = {
      get history() {
        return history;
      },
      get strokes() {
        return [...strokes.keys()];
      },
    };
  }

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


