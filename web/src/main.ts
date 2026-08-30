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
import { renderMarkdown } from "./markdown.js";
import { e2eeSupported } from "./e2ee-crypto.js";
import { CustomSelect, customCheckbox } from "./controls.js";
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

function langSelector(): HTMLElement {
  const sel = new CustomSelect(t("language"), allLangs().map((lang) => ({ value: lang, label: lang.toUpperCase() })), getLang(), "lang-select");
  sel.onChange = (value) => {
    setLang(value as ReturnType<typeof getLang>);
    renderCurrentRoute();
  };
  return sel.root;
}

function field(label: string, control: HTMLElement, hint?: string): HTMLDivElement {
  const labelEl = el("label", { class: "field-label" }, label);
  const id = control.id || `field-${crypto.randomUUID()}`;
  control.id = id;
  labelEl.htmlFor = id;
  const children: Node[] = [labelEl, control];
  if (hint) children.push(el("span", { class: "field-hint" }, hint));
  return el("div", { class: "field" }, ...children);
}

function trapFocusWithin(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== "Tab") return;
  const focusable = [...root.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")]
    .filter((node) => node.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function confirmAction(title: string, detail: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = el("button", { class: "secondary" }, t("cancel"));
    const confirm = el("button", { class: "primary danger-action" }, confirmLabel);
    const dialog = el("div", { class: "confirm-dialog", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "confirm-title", "aria-describedby": "confirm-detail" },
      el("span", { class: "eyebrow" }, t("confirmation")),
      el("h2", { id: "confirm-title" }, title),
      el("p", { id: "confirm-detail" }, detail),
      el("div", { class: "confirm-actions" }, cancel, confirm)
    );
    const backdrop = el("div", { class: "dialog-backdrop" }, dialog);
    const finish = (value: boolean): void => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") finish(false);
      if (event.key === "Tab") {
        const next = document.activeElement === cancel ? confirm : cancel;
        event.preventDefault();
        next.focus();
      }
    };
    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);
    backdrop.addEventListener("mousedown", (event) => event.target === backdrop && finish(false));
    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    cancel.focus();
  });
}

function showShortcutsDialog(trigger: HTMLElement): void {
  if (document.querySelector(".shortcuts-dialog")) return;
  const close = el("button", { class: "secondary" }, t("close"));
  const shortcuts = el("dl", { class: "shortcut-list" },
    el("div", {}, el("dt", {}, el("kbd", {}, "M")), el("dd", {}, t("shortcutMic"))),
    el("div", {}, el("dt", {}, el("kbd", {}, "V")), el("dd", {}, t("shortcutCamera"))),
    el("div", {}, el("dt", {}, el("kbd", {}, "Ctrl", "+", "Z")), el("dd", {}, t("shortcutUndo"))),
    el("div", {}, el("dt", {}, el("kbd", {}, "Esc")), el("dd", {}, t("shortcutClose"))),
    el("div", {}, el("dt", {}, el("kbd", {}, "?")), el("dd", {}, t("shortcutHelp")))
  );
  const dialog = el("section", { class: "confirm-dialog shortcuts-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "shortcuts-title" },
    el("span", { class: "eyebrow" }, t("meeting")),
    el("h2", { id: "shortcuts-title" }, t("keyboardShortcuts")),
    el("p", {}, t("shortcutsDetail")),
    shortcuts,
    el("div", { class: "confirm-actions" }, close)
  );
  const backdrop = el("div", { class: "dialog-backdrop" }, dialog);
  const finish = (): void => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    trigger.focus();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    } else if (event.key === "Tab") {
      event.preventDefault();
      close.focus();
    }
  };
  close.onclick = finish;
  backdrop.addEventListener("mousedown", (event) => event.target === backdrop && finish());
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  close.focus();
}

let currentRouteRender: () => void = () => renderLanding();

function renderCurrentRoute(): void {
  currentRouteRender();
}

function showOnboarding(): void {
  if (localStorage.getItem("visio:onboarding") === "done" || document.querySelector(".onboarding-backdrop")) return;
  const steps = [
    { title: t("onboardingWelcomeTitle"), detail: t("onboardingWelcomeDetail"), iconName: "cam" },
    { title: t("onboardingSetupTitle"), detail: t("onboardingSetupDetail"), iconName: "check" },
    { title: t("onboardingMeetTitle"), detail: t("onboardingMeetDetail"), iconName: "screen" },
  ];
  let index = 0;
  const previousFocus = document.activeElement as HTMLElement | null;
  const illustration = el("div", { class: "onboarding-mark", "aria-hidden": "true" });
  const heading = el("h2", { id: "onboarding-title", tabindex: "-1" });
  const detail = el("p", { id: "onboarding-detail" });
  const status = el("span", { class: "onboarding-count", "aria-live": "polite" });
  const dots = el("div", { class: "onboarding-progress", "aria-hidden": "true" });
  const skip = el("button", { class: "onboarding-skip" }, t("onboardingSkip"));
  const back = el("button", { class: "secondary" }, t("onboardingBack"));
  const next = el("button", { class: "primary" }, t("onboardingNext"));
  const dialog = el("section", { class: "onboarding-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "onboarding-title", "aria-describedby": "onboarding-detail" },
    el("div", { class: "onboarding-head" }, el("span", { class: "eyebrow" }, t("onboardingLabel")), skip),
    illustration, heading, detail,
    el("div", { class: "onboarding-meta" }, dots, status),
    el("div", { class: "onboarding-actions" }, back, next)
  );
  const backdrop = el("div", { class: "dialog-backdrop onboarding-backdrop" }, dialog);
  const finish = (): void => {
    localStorage.setItem("visio:onboarding", "done");
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    previousFocus?.focus();
  };
  const render = (): void => {
    const step = steps[index];
    illustration.replaceChildren(icon(step.iconName, 24));
    heading.textContent = step.title;
    detail.textContent = step.detail;
    status.textContent = `${index + 1} / ${steps.length}`;
    dots.replaceChildren(...steps.map((_, i) => el("span", { class: i === index ? "active" : "" })));
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? t("onboardingDone") : t("onboardingNext");
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") finish();
    else if (event.key === "Tab") trapFocusWithin(event, dialog);
  };
  skip.onclick = finish;
  back.onclick = () => { if (index > 0) { index--; render(); heading.focus(); } };
  next.onclick = () => { if (index === steps.length - 1) finish(); else { index++; render(); heading.focus(); } };
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  render();
  next.focus();
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
  const formStatus = el("p", { class: "form-status", role: "alert", "aria-live": "assertive" });

  const createBtn = el("button", { class: "primary" }, t("createRoom"));
  createBtn.type = "button";
  createBtn.onclick = async () => {
    if (nameInput.value.trim()) localStorage.setItem("visio:name", nameInput.value.trim());
    createBtn.disabled = true;
    try {
      const res = await fetch(apiUrl("/api/new-room"));
      const { roomId } = (await res.json()) as { roomId: string };
      location.href = `/j/${roomId}`;
    } catch {
      createBtn.disabled = false;
      formStatus.textContent = isDesktop ? t("setServerFirst") : t("serverUnreachable");
      createBtn.textContent = t("createRoom");
    }
  };

  const joinBtn = el("button", { class: "secondary" }, t("join"));
  joinBtn.type = "button";
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
    } else {
      tokenInput.setAttribute("aria-invalid", "true");
      formStatus.textContent = t("invalidRoomLink");
      tokenInput.focus();
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
    el("section", { class: "landing-hero", "aria-labelledby": "landing-title" },
      el("div", { class: "brand-lockup" },
        el("span", { class: "eyebrow" }, t("brandEyebrow")),
        el("h1", { class: "wordmark", id: "landing-title" }, "visio", el("em", {}, ".")),
        el("p", { class: "tagline" }, t("tagline"))
      ),
      el("div", { class: "card landing-card" },
        field(t("namePlaceholder"), nameInput),
        createBtn,
        el("div", { class: "divider", role: "separator" }, el("span", {}, t("or"))),
        field(t("codePlaceholder"), tokenInput),
        joinBtn,
        formStatus,
        el("p", { class: "privacy-note" }, t("privacyNote"))
      )
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
      const saveBtn = el("button", { class: "secondary" }, t("save"));
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
          el("div", { class: "row gap full" }, field("SFU server", serverInput), saveBtn),
          status
        )
      );
      if (getServerBase()) void checkAndSave();
    });
  }

  app.replaceChildren(landing);
  queueMicrotask(showOnboarding);
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
  const heading = el("h1", { class: "wordmark", tabindex: "-1" }, title);
  app.replaceChildren(
    el("main", { class: "landing" },
      el("div", { class: "top-bar" }, langSelector(), themeToggleButton()),
      el("section", { class: "error-state", role: "alert", "aria-live": "assertive" },
        heading,
        el("p", { class: "tagline" }, detail),
        backBtn
      )
    )
  );
  heading.focus();
}

// ---------- Pre-join ----------

async function renderPreJoin(roomId: string): Promise<void> {
  currentRouteRender = () => void renderPreJoin(roomId);
  document.title = t("joinRoom");
  app.replaceChildren(
    el("main", { class: "loading-screen", "aria-busy": "true" },
      el("div", { class: "top-bar" }, langSelector(), themeToggleButton()),
      el("span", { class: "loading-mark", "aria-hidden": "true" }, "v", el("em", {}, ".")),
      el("div", { class: "loading-line", "aria-hidden": "true" }),
      el("p", { role: "status" }, t("preparingDevices"))
    )
  );
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
  const meterFill = el("span", { class: "mic-meter-fill" });
  const micMeter = el("div", { class: "mic-meter", role: "meter", "aria-label": t("micLevel"), "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, meterFill);
  let meterContext: AudioContext | null = null;
  let meterFrame = 0;
  function stopMeter(): void {
    cancelAnimationFrame(meterFrame);
    void meterContext?.close();
    meterContext = null;
  }
  function connectMeter(media: MediaStream | null): void {
    stopMeter();
    if (!media?.getAudioTracks().length) return;
    meterContext = new AudioContext();
    const analyser = meterContext.createAnalyser();
    analyser.fftSize = 256;
    meterContext.createMediaStreamSource(new MediaStream(media.getAudioTracks())).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const update = (): void => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += Math.abs(sample - 128);
      const level = Math.min(100, Math.round((energy / samples.length) * 5));
      meterFill.style.width = `${level}%`;
      micMeter.setAttribute("aria-valuenow", String(level));
      meterFrame = requestAnimationFrame(update);
    };
    update();
  }
  const micBtn = el("button", { class: "icon-toggle", title: t("toggleMic"), "aria-label": t("toggleMic"), "aria-pressed": "true" }, icon("mic"));
  const camBtn = el("button", { class: "icon-toggle", title: t("toggleCam"), "aria-label": t("toggleCam"), "aria-pressed": "true" }, icon("cam"));

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
  connectMeter(stream);
  const previewStatus = el("div", { class: `preview-status${stream ? " hidden" : ""}`, role: "status" }, t("deviceUnavailable"));

  const camSelect = new CustomSelect<string>(t("selectCamera"), [], "", "device-select hidden");
  const micSelect = new CustomSelect<string>(t("selectMic"), [], "", "device-select hidden");

  async function populateDevices(): Promise<void> {
    const { cams, mics } = await listAudioVideoDevices().catch(() => ({ cams: [], mics: [] }));
    if (cams.length > 1 || localStorage.getItem("visio:camId")) {
      const savedCam = localStorage.getItem("visio:camId");
      const selected = savedCam ?? stream?.getVideoTracks()[0]?.getSettings().deviceId ?? cams[0]?.deviceId ?? "";
      camSelect.setOptions(cams.map((d, i) => ({ value: d.deviceId, label: deviceLabel(d, i) })), selected);
      camSelect.root.classList.remove("hidden");
    }
    if (mics.length > 1 || localStorage.getItem("visio:micId")) {
      const savedMic = localStorage.getItem("visio:micId");
      const selected = savedMic ?? stream?.getAudioTracks()[0]?.getSettings().deviceId ?? mics[0]?.deviceId ?? "";
      micSelect.setOptions(mics.map((d, i) => ({ value: d.deviceId, label: deviceLabel(d, i) })), selected);
      micSelect.root.classList.remove("hidden");
    }
  }
  void populateDevices();

  async function switchDevice(kind: "cam" | "mic", deviceId: string): Promise<void> {
    localStorage.setItem(kind === "cam" ? "visio:camId" : "visio:micId", deviceId);
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = await acquire();
    preview.srcObject = stream;
    connectMeter(stream);
  }
  camSelect.onChange = (value) => void switchDevice("cam", value);
  micSelect.onChange = (value) => void switchDevice("mic", value);

  micBtn.onclick = () => {
    micOn = !micOn;
    micBtn.classList.toggle("off", !micOn);
    micBtn.replaceChildren(icon(micOn ? "mic" : "mic-off"));
    micBtn.setAttribute("aria-pressed", String(micOn));
    stream?.getAudioTracks().forEach((tr) => (tr.enabled = micOn));
    micMeter.classList.toggle("muted", !micOn);
  };
  camBtn.onclick = () => {
    camOn = !camOn;
    camBtn.classList.toggle("off", !camOn);
    camBtn.replaceChildren(icon(camOn ? "cam" : "cam-off"));
    camBtn.setAttribute("aria-pressed", String(camOn));
    preview.classList.toggle("camera-off", !camOn);
    stream?.getVideoTracks().forEach((tr) => (tr.enabled = camOn));
  };

  const e2eeOn = localStorage.getItem("visio:e2ee") === "1";
  const e2eeToggle = customCheckbox(t("e2eeLabel"), e2eeOn, (checked) => {
    localStorage.setItem("visio:e2ee", checked ? "1" : "0");
  });

  const joinBtn = el("button", { class: "primary" }, t("joinRoom"));
  joinBtn.onclick = () => {
    joinBtn.disabled = true;
    joinBtn.textContent = t("joining");
    const name = nameInput.value.trim() || t("guest");
    localStorage.setItem("visio:name", name);
    stopMeter();
    stream?.getTracks().forEach((tr) => tr.stop()); // re-captured after join
    void startRoom(roomId, name);
  };

  app.replaceChildren(
    el("main", { class: "prejoin" },
      el("div", { class: "top-bar" }, langSelector(), themeToggleButton()),
      el("header", { class: "prejoin-head" },
        el("a", { class: "brand-link", href: "/", "aria-label": "Visio home" }, "visio", el("em", {}, ".")),
        el("div", {},
          el("span", { class: "eyebrow" }, t("joinRoom")),
          el("h1", {}, roomId.slice(0, 8))
        )
      ),
      el("section", { class: "prejoin-shell", "aria-label": t("joinRoom") },
        el("div", { class: "preview-wrap" }, preview, previewStatus,
          el("div", { class: "preview-controls" }, micBtn, camBtn)
        ),
        el("div", { class: "card prejoin-card" },
          el("div", { class: "section-heading" },
            el("span", { class: "eyebrow" }, t("setup")),
            el("h2", {}, t("joinRoom"))
          ),
          field(t("namePlaceholder"), nameInput),
          el("div", { class: "device-grid" },
            field(t("selectCamera"), camSelect.root),
            field(t("selectMic"), micSelect.root)
          ),
          el("div", { class: "mic-level-row" }, el("span", {}, t("micLevel")), micMeter),
          el("div", { class: "e2ee-row" }, e2eeToggle),
          el("p", { class: "privacy-note" }, t("privacyNote")),
          joinBtn
        )
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
  const participantValue = el("span", { class: "room-participant-value" }, "1");
  const connectionValue = el("span", { class: "room-connection-value" }, t("connected"));
  const elapsedValue = el("time", { class: "room-elapsed", "aria-label": t("meetingDuration") }, "00:00");
  const roomHeader = el("header", { class: "room-header" },
    el("div", { class: "room-identity" },
      el("a", { class: "brand-link room-brand", href: "/", "aria-label": "Visio home" }, "visio", el("em", {}, ".")),
      el("div", {},
        el("span", { class: "eyebrow" }, t("meeting")),
        el("strong", { class: "room-code" }, roomId.slice(0, 8))
      )
    ),
    el("div", { class: "room-status", role: "status", "aria-live": "polite" },
      el("span", { class: "status-item connection-status" }, el("span", { class: "status-dot" }), connectionValue),
      el("span", { class: "status-divider", "aria-hidden": "true" }),
      el("span", { class: "status-item" }, elapsedValue),
      el("span", { class: "status-divider", "aria-hidden": "true" }),
      el("span", { class: "status-item" }, participantValue, t("participants"))
    )
  );
  const announcements = el("div", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const announce = (message: string): void => {
    announcements.textContent = "";
    window.setTimeout(() => { announcements.textContent = message; }, 20);
  };
  const meetingStarted = Date.now();
  const elapsedTimer = window.setInterval(() => {
    const total = Math.floor((Date.now() - meetingStarted) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    elapsedValue.textContent = hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    elapsedValue.dateTime = `PT${total}S`;
  }, 1000);

  function updateParticipantCount(): void {
    participantValue.textContent = String(peerNames.size + 1);
  }

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
      const initials = labelText.replace(/\s*\([^)]*\)|\s*—.*$/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "V";
      const placeholder = el("div", { class: "tile-placeholder", "aria-hidden": "true" },
        el("span", { class: "tile-initials" }, initials),
        el("span", {}, t("cameraOff"))
      );
      const root = el("div", { class: "tile" }, video, placeholder, label);
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

  const e2ee = localStorage.getItem("visio:e2ee") === "1" && e2eeSupported();
  const client = new RoomClient(wsUrl("/ws"), roomId, displayName, iceServers, e2ee);
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
        const stop = el("button", { class: "label-btn", title: t("stopSharing"), "aria-label": t("stopSharing") });
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
    kickBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!await confirmAction(t("removeParticipantTitle"), t("removeParticipantDetail"), t("kickPeer"))) return;
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

  const layoutBtn = el("button", { class: "control", "aria-label": t("layout") });
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
    updateParticipantCount();
    relabel(peerId);
    playCue("join");
    announce(`${name} ${t("joinedMeeting")}`);
  };

  client.onPeerLeft = (peerId) => {
    const departedName = peerNames.get(peerId) ?? t("guest");
    for (const key of [...tiles.keys()]) {
      if (key.startsWith(`${peerId}:`)) removeTile(key);
    }
    peerNames.delete(peerId);
    updateParticipantCount();
    if (pinnedKey && !tiles.has(pinnedKey)) pinnedKey = null;
    applyLayout();
    playCue("leave");
    announce(`${departedName} ${t("leftMeeting")}`);
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
  const modeOptions = MODES.map((mode) => ({ value: mode, label: MODE_LABELS[getLang()][mode] ?? MODE_PROFILES[mode].label, description: MODE_PROFILES[mode].description }));
  const selectedQualityMode = (MODES.includes(savedMode as Mode) ? savedMode : "balanced") as Mode;
  const qualitySelect = new CustomSelect<Mode>(t("qualityMode"), modeOptions, selectedQualityMode, "quality-select");
  const mobileQualitySelect = new CustomSelect<Mode>(t("qualityMode"), modeOptions, selectedQualityMode, "quality-select");
  const qualityControl = el("div", { class: "quality-control" },
    el("span", { class: "quality-label" }, t("qualityMode")),
    qualitySelect.root
  );
  function selectMode(mode: Mode): void {
    currentProfile = MODE_PROFILES[mode];
    localStorage.setItem("visio:mode", mode);
    qualitySelect.value = mode;
    mobileQualitySelect.value = mode;
    void client.applyMode(currentProfile);
    for (const tl of tiles.values()) {
      applyJitter(tl.video as never);
      if (tl.audio) applyJitter(tl.audio as never);
    }
  }
  qualitySelect.onChange = selectMode;
  mobileQualitySelect.onChange = selectMode;

  // ---- Controls ----
  let micOn = true;
  let camOn = true;
  const micBtn = iconControl("mic", "mic-off", t("mic"), true);
  const camBtn = iconControl("cam", "cam-off", t("cam"), true);
  micBtn.dataset.offTreatment = "true";
  camBtn.dataset.offTreatment = "true";
  const screenBtn = iconControl("screen", "screen", t("shareScreen"), false);
  const chatBtn = iconControl("chat", "chat", t("chatTitle"), false);
  const boardBtn = iconControl("pen", "pen", t("boardTitle"), false);
  const copyBtn = iconControl("link", "check", t("invite"), false);
  const netBtn = iconControl("activity", "activity", t("netDiagnostics"), false);
  const shortcutsBtn = iconControl("keyboard", "keyboard", t("keyboardShortcuts"), false);
  const lockBtn = iconControl("lock", "unlock", t("lockRoom"), false);
  lockBtn.classList.add("hidden"); // guests never see it
  const recBtn = iconControl("stop", "record", t("record"), false);
  const leaveBtn = iconControl("leave", "leave", t("leave"), false, "danger");
  const themeBtn = themeToggleButton();
  const moreBtn = iconControl("more", "more", t("moreActions"), false);
  moreBtn.classList.add("mobile-more");
  chatBtn.classList.add("mobile-essential");
  const roomMain = el("main", { class: "room" });
  for (const btn of [micBtn, camBtn, chatBtn, boardBtn, netBtn, lockBtn, recBtn]) {
    btn.setAttribute("aria-pressed", "false");
  }
  micBtn.setAttribute("aria-pressed", "true");
  camBtn.setAttribute("aria-pressed", "true");
  chatBtn.setAttribute("aria-controls", "chat-panel");
  boardBtn.setAttribute("aria-controls", "whiteboard");

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
    selfTile.root.classList.toggle("camera-disabled", !camOn);
  };
  shortcutsBtn.onclick = () => showShortcutsDialog(shortcutsBtn);

  const mobileMenu = el("div", { class: "mobile-actions hidden", role: "dialog", "aria-label": t("moreActions") });
  mobileMenu.addEventListener("keydown", (event) => trapFocusWithin(event, mobileMenu));
  function mobileAction(iconName: string, label: string, target: HTMLButtonElement): HTMLButtonElement {
    const button = el("button", { class: "mobile-action" }, icon(iconName, 17), el("span", {}, label));
    button.onclick = () => {
      mobileMenu.classList.add("hidden");
      moreBtn.setAttribute("aria-expanded", "false");
      target.click();
    };
    return button;
  }
  const mobileLockAction = mobileAction("lock", t("lockRoom"), lockBtn);
  mobileMenu.append(
    el("div", { class: "mobile-quality" }, el("span", {}, t("qualityMode")), mobileQualitySelect.root),
    mobileAction("grid", t("layout"), layoutBtn),
    mobileAction("record", t("record"), recBtn),
    mobileAction("pen", t("boardTitle"), boardBtn),
    mobileAction("link", t("invite"), copyBtn),
    mobileAction("activity", t("netDiagnostics"), netBtn),
    mobileLockAction,
    mobileAction("keyboard", t("keyboardShortcuts"), shortcutsBtn),
    mobileAction("moon", t("theme"), themeBtn)
  );
  moreBtn.setAttribute("aria-haspopup", "dialog");
  moreBtn.setAttribute("aria-expanded", "false");
  moreBtn.onclick = () => {
    const opening = mobileMenu.classList.contains("hidden");
    mobileLockAction.classList.toggle("hidden", lockBtn.classList.contains("hidden"));
    mobileMenu.classList.toggle("hidden", !opening);
    moreBtn.setAttribute("aria-expanded", String(opening));
    if (opening) window.setTimeout(() => mobileMenu.querySelector<HTMLElement>("select, button")?.focus(), 0);
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
    showToast(roomMain, t("copied"));
  };

  let netPanel: NetPanel | null = null;
  netBtn.onclick = () => {
    if (netPanel) return;
    if (!chat.root.classList.contains("hidden")) chat.root.querySelector<HTMLButtonElement>(".panel-close")?.click();
    setIconControl(netBtn, true, "activity");
    netPanel = new NetPanel(client, () => {
      netPanel = null;
      setIconControl(netBtn, false, "activity");
    });
    roomMain.append(netPanel.element);
    window.setTimeout(() => netPanel?.element.querySelector<HTMLButtonElement>(".panel-close")?.focus(), 0);
  };

  leaveBtn.onclick = async () => {
    if (!await confirmAction(t("leaveConfirmTitle"), t("leaveConfirmDetail"), t("leave"))) return;
    client.close();
    location.href = "/";
  };

  // ---- Chat + temporary file sharing ----
  let roomLocked = false;
  lockBtn.onclick = () => {
    roomLocked = !roomLocked;
    void client.signal.request("moderate", { action: roomLocked ? "lock" : "unlock" });
    setIconControl(lockBtn, roomLocked, "lock");
    lockBtn.title = roomLocked ? t("unlockRoom") : t("lockRoom");
    lockBtn.setAttribute("aria-label", lockBtn.title);
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
      showToast(roomMain, t("recordingSaved"));
    };
    recorder.start(1000);
    setIconControl(recBtn, true, "record");
    showToast(roomMain, t("recordingStarted"));
  };

  // ---- Keyboard shortcuts (ignored while typing) ----
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (e.key === "Escape") {
      if (!mobileMenu.classList.contains("hidden")) {
        mobileMenu.classList.add("hidden");
        moreBtn.setAttribute("aria-expanded", "false");
        moreBtn.focus();
        return;
      }
      const close = roomMain.querySelector<HTMLButtonElement>(".side-panel:not(.hidden) .panel-close, .net-panel .panel-close");
      if (close) close.click();
      else if (!board.overlay.classList.contains("hidden")) boardBtn.click();
      return;
    }
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === "?") {
      e.preventDefault();
      showShortcutsDialog(shortcutsBtn);
      return;
    }
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
    if (!open && netPanel) netPanel.close();
    chat.root.classList.toggle("hidden", open);
    setIconControl(chatBtn, !open, "chat");
    if (!open) window.setTimeout(() => chat.root.querySelector("textarea")?.focus(), 0);
    else chatBtn.focus();
  };

  // ---- Whiteboard ----
  const board = buildWhiteboard(client, () => {
    setIconControl(boardBtn, false, "pen");
    boardBtn.focus();
  });
  boardBtn.onclick = () => {
    const open = !board.overlay.classList.contains("hidden");
    if (!open) {
      if (netPanel) netPanel.close();
      if (!chat.root.classList.contains("hidden")) chat.root.querySelector<HTMLButtonElement>(".panel-close")?.click();
    }
    board.overlay.classList.toggle("hidden", open);
    setIconControl(boardBtn, !open, "pen");
    if (!open) window.setTimeout(() => board.overlay.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    else boardBtn.focus();
  };

  // ---- Reconnect banner ----
  const banner = el("div", { class: "reconnect-banner hidden", role: "status", "aria-live": "assertive" }, t("reconnecting"));
  client.signal.onConnectionLost = () => {
    banner.classList.remove("hidden");
    connectionValue.textContent = t("reconnecting");
    roomHeader.classList.add("connection-lost");
  };
  client.signal.onRestored = () => {
    banner.classList.add("hidden");
    connectionValue.textContent = t("connected");
    roomHeader.classList.remove("connection-lost");
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

  window.addEventListener("pagehide", () => {
    window.clearInterval(elapsedTimer);
    client.close();
  }, { once: true });

  roomMain.append(
    roomHeader,
    el("section", { class: "media-stage", "aria-label": t("meeting") }, grid),
    board.overlay,
    el("footer", { class: "controls", "aria-label": t("meetingControls") },
      el("div", { class: "controls-group controls-context" }, layoutBtn, qualityControl),
      el("div", { class: "controls-group controls-primary" }, micBtn, camBtn, screenBtn),
      el("div", { class: "controls-group controls-secondary" }, recBtn, chatBtn, boardBtn, copyBtn, netBtn, lockBtn, shortcutsBtn, themeBtn),
      el("div", { class: "controls-group controls-session" }, moreBtn, leaveBtn)
    ),
    banner,
    announcements,
    chat.root,
    mobileMenu,
    el("div", { class: "toast-region", role: "status", "aria-live": "polite", "aria-atomic": "true" })
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

function showToast(scope: HTMLElement, message: string): void {
  const region = scope.querySelector<HTMLElement>(".toast-region");
  if (!region) return;
  const toast = el("div", { class: "toast" }, icon("check", 15), el("span", {}, message));
  region.replaceChildren(toast);
  window.setTimeout(() => toast.classList.add("leaving"), 2200);
  window.setTimeout(() => toast.remove(), 2500);
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
  btn.dataset.label = label;
  renderControlContent(btn, initialOn ? onIcon : offIcon, label);
  btn.dataset.onIcon = onIcon;
  btn.dataset.offIcon = offIcon;
  return btn;
}

function renderControlContent(btn: HTMLButtonElement, iconName: string, label = btn.dataset.label ?? ""): void {
  btn.replaceChildren(icon(iconName), el("span", { class: "control-label" }, label));
}

function setIconControl(btn: HTMLButtonElement, on: boolean, ..._rest: string[]): void {
  btn.classList.toggle("off", !on && btn.dataset.offTreatment === "true");
  btn.setAttribute("aria-pressed", String(on));
  renderControlContent(btn, on ? btn.dataset.onIcon! : (btn.dataset.offIcon ?? btn.dataset.onIcon!));
}

// ---------- Chat panel + temporary files ----------

interface FileIncoming {
  name: string;
  size: number;
  mime: string;
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
  const root = el("aside", { class: "side-panel chat-panel hidden", id: "chat-panel", "aria-label": t("chatTitle") });
  root.addEventListener("keydown", (event) => trapFocusWithin(event, root));
  const messages = el("div", { class: "chat-messages", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  const emptyState = el("div", { class: "panel-empty" },
    el("span", { class: "panel-empty-icon", "aria-hidden": "true" }, icon("chat", 20)),
    el("strong", {}, t("chatEmptyTitle")),
    el("p", {}, t("chatEmptyDetail"))
  );
  messages.append(emptyState);
  const input = el("textarea", { placeholder: t("chatPlaceholder"), maxlength: "2000", rows: "1", "aria-label": t("chatPlaceholder") });
  const fileInput = el("input", { type: "file", multiple: "" }) as HTMLInputElement;
  fileInput.style.display = "none";

  const sendBtn = el("button", { class: "primary composer-send", title: t("send"), "aria-label": t("send") }, icon("send", 16));
  const attachBtn = el("button", { class: "control small", title: t("attachFile"), "aria-label": t("attachFile") }, icon("file", 16));

  const closeBtn = el("button", { class: "panel-close", "aria-label": t("close") }, icon("x", 18));
  const head = el("div", { class: "panel-head" },
    el("div", {}, el("span", { class: "eyebrow" }, t("meeting")), el("h2", {}, t("chatTitle"))),
    closeBtn
  );

  root.append(head, messages, el("div", { class: "row gap full chat-input-row" }, attachBtn, input, sendBtn), fileInput);
  closeBtn.onclick = () => {
    root.classList.add("hidden");
    onClose();
  };

  const sendText = (): void => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const ts = Date.now();
    addMessage(displayName, text, true, ts);
    client.sendApp(JSON.stringify({ t: "chat", name: displayName, text, ts }));
  };
  sendBtn.onclick = sendText;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  });

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

  function imageChip(name: string, blobUrl: string, sizeLabel: string): HTMLElement {
    const wrap = el("div", { class: "file-chip image-chip" });
    const img = el("img", { src: blobUrl, alt: name }) as HTMLImageElement;
    img.loading = "lazy";
    const view = el("a", { href: blobUrl, target: "_blank", rel: "noopener" }, img);
    const dl = el("a", { href: blobUrl, download: name }, t("download"));
    dl.className = "image-dl";
    wrap.append(view, el("span", {}, `${name} · ${sizeLabel}`), dl);
    return wrap;
  }

  function fmtSize(n: number): string {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
  }

  function addLine(node: HTMLElement): void {
    emptyState.remove();
    messages.append(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(name: string, text: string, self: boolean, timestamp = Date.now()): void {
    const body = el("span", { class: "msg-body" });
    body.innerHTML = renderMarkdown(text);
    const time = new Date(timestamp);
    const line = el("div", { class: `msg${self ? " self" : ""}` },
      el("div", { class: "msg-meta" },
        el("span", { class: "msg-name" }, name),
        el("time", { datetime: time.toISOString() }, time.toLocaleTimeString(getLang(), { hour: "2-digit", minute: "2-digit" }))
      ),
      body
    );
    addLine(line);
  }

  // Image paste straight into the chat input.
  input.addEventListener("paste", (e) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) void sendFile(f);
  });

  function addSystem(text: string): void {
    addLine(el("div", { class: "msg system" }, el("span", {}, text)));
  }

  const incomingFiles = new Map<string, FileIncoming>();

  client.onAppMessage = (peerId, data) => {
    const name = peerNames.get(peerId) ?? t("guest");
    if (typeof data === "string") {
      let env: { t?: string; name?: string; text?: string; ts?: number; id?: string; size?: number; mime?: string };
      try {
        env = JSON.parse(data);
      } catch {
        return;
      }
      if (env.t === "chat") {
        addMessage(env.name ?? name, String(env.text ?? "").slice(0, 2000), false, typeof env.ts === "number" ? env.ts : Date.now());
      } else if (env.t === "fmeta" && env.id) {
        incomingFiles.set(env.id, {
          name: String(env.name ?? "file").slice(0, 120),
          size: Number(env.size ?? 0),
          mime: String(env.mime ?? ""),
          chunks: [],
          received: 0,
        });
        progressRow(`${name}: ${env.name ?? ""}`, env.id, false);
      } else if (env.t === "fend" && env.id) {
        const f = incomingFiles.get(env.id);
        const tr = transferRows.get(env.id);
        if (!f) return;
        const blob = new Blob(f.chunks as BlobPart[], { type: f.mime || undefined });
        const url = URL.createObjectURL(blob);
        incomingFiles.delete(env.id);
        tr?.finish();
        transferRows.delete(env.id);
        if (f.mime.startsWith("image/")) {
          addLine(imageChip(f.name, url, fmtSize(blob.size)));
        } else {
          addLine(downloadChip(f.name, url, fmtSize(blob.size)));
        }
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

function buildWhiteboard(client: RoomClient, onClose: () => void): { overlay: HTMLDivElement } {
  const overlay = el("div", { class: "board-overlay hidden", id: "whiteboard", role: "region", "aria-label": t("boardTitle") });
  overlay.addEventListener("keydown", (event) => trapFocusWithin(event, overlay));
  const canvas = el("canvas", { class: "board-canvas", tabindex: "0", role: "img", "aria-label": t("boardCanvasLabel") }) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const colors = ["#292520", "#d97757", "#5b7a9d", "#6b7f3e", "#f6f2ec"];
  const widths = [2, 5, 10, 18];
  type BoardTool = "pen" | "brush" | "highlighter" | "eraser" | "line" | "rectangle" | "ellipse";
  let tool: BoardTool = "pen";
  let color = colors[1];
  let width = widths[1];

  const toolbar = el("div", { class: "board-toolbar", role: "toolbar", "aria-label": t("boardTools") });
  const toolIdentity = el("div", { class: "board-tool-identity" }, el("span", { class: "eyebrow" }, t("meeting")), el("span", { class: "board-title" }, t("boardTitle")));
  const modeGroup = el("div", { class: "board-tool-group board-mode-group", role: "group", "aria-label": t("boardTool") });
  const toolButtons = ([
    ["pen", "pen", t("boardPen")],
    ["brush", "brush", t("boardBrush")],
    ["highlighter", "highlighter", t("boardHighlighter")],
    ["eraser", "eraser", t("boardEraser")],
    ["line", "line", t("boardLine")],
    ["rectangle", "rectangle", t("boardRectangle")],
    ["ellipse", "ellipse", t("boardEllipse")],
  ] as const).map(([value, iconName, label]) => {
    const button = el("button", { class: `board-mode${value === tool ? " active" : ""}`, title: label, "aria-label": label, "aria-pressed": String(value === tool) }, icon(iconName, 16));
    button.onclick = () => {
      tool = value;
      width = tool === "brush" ? 10 : tool === "highlighter" || tool === "eraser" ? 18 : 5;
      modeGroup.querySelectorAll(".board-mode").forEach((node) => {
        node.classList.toggle("active", node === button);
        node.setAttribute("aria-pressed", String(node === button));
      });
      widthGroup.querySelectorAll(".width-btn").forEach((node) => {
        const active = Number((node as HTMLElement).dataset.width) === width;
        node.classList.toggle("active", active);
        node.setAttribute("aria-pressed", String(active));
      });
      canvas.dataset.tool = tool;
    };
    return button;
  });
  modeGroup.append(...toolButtons);
  const colorGroup = el("div", { class: "board-tool-group", role: "group", "aria-label": t("boardColor") });

  const swatches = colors.map((c, index) => {
    const b = el("button", { class: "swatch", title: `${t("boardColor")} ${index + 1}`, "aria-label": `${t("boardColor")} ${index + 1}`, "aria-pressed": String(c === color) });
    b.style.background = c;
    if (c === color) b.classList.add("active");
    b.onclick = () => {
      color = c;
      toolbar.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
      toolbar.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s === b)));
      b.classList.add("active");
    };
    return b;
  });
  colorGroup.append(...swatches);
  const widthGroup = el("div", { class: "board-tool-group", role: "group", "aria-label": t("boardStroke") });

  for (const w of widths) {
    const b = el("button", { class: `width-btn${w === width ? " active" : ""}`, title: `${t("boardStroke")} ${w}px`, "aria-label": `${t("boardStroke")} ${w}px`, "aria-pressed": String(w === width), "data-width": String(w) });
    const dot = el("span") as HTMLSpanElement;
    dot.className = "dot";
    dot.style.width = dot.style.height = `${w * 2}px`;
    b.append(dot);
    b.onclick = () => {
      width = w;
      toolbar.querySelectorAll(".width-btn").forEach((x) => x.classList.remove("active"));
      toolbar.querySelectorAll(".width-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      b.classList.add("active");
    };
    widthGroup.append(b);
  }

  const undoBtn = el("button", { class: "control small", title: `${t("undo")} · Ctrl+Z`, "aria-label": t("undo") }, icon("undo", 15));
  undoBtn.onclick = () => undoMyLast();
  const clearBtn = el("button", { class: "control small", title: t("boardClear") }, icon("trash", 15));
  clearBtn.onclick = async () => {
    if (!await confirmAction(t("clearBoardTitle"), t("clearBoardDetail"), t("boardClear"))) return;
    history.length = 0;
    myStrokeIds.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.clear();
    void client.signal.request("wbClear");
  };
  const closeBtn = el("button", { class: "control small", title: t("close"), "aria-label": t("close") }, icon("x", 15));
  closeBtn.onclick = () => {
    overlay.classList.add("hidden");
    onClose();
  };
  const actionGroup = el("div", { class: "board-tool-group board-actions" }, undoBtn, clearBtn, closeBtn);
  toolbar.append(toolIdentity, modeGroup, colorGroup, widthGroup, actionGroup);

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
    tool: BoardTool;
    opacity: number;
    points: number[];
  }
  const strokes = new Map<string, LiveStroke>();
  const history: WBOp[] = [];

  function drawSegment(pts: number[], strokeColor: string, w: number, strokeTool: BoardTool, opacity: number): void {
    if (pts.length < 4) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = strokeTool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w * devicePixelRatio;
    ctx.lineCap = strokeTool === "highlighter" ? "butt" : "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0] * canvas.width, pts[1] * canvas.height);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i] * canvas.width, pts[i + 1] * canvas.height);
    }
    ctx.stroke();
    ctx.restore();
  }

  function shapePoints(shape: BoardTool, x1: number, y1: number, x2: number, y2: number): number[] {
    if (shape === "line") return [x1, y1, x2, y2];
    if (shape === "rectangle") return [x1, y1, x2, y1, x2, y2, x1, y2, x1, y1];
    if (shape === "ellipse") {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      return Array.from({ length: 66 }, (_, index) => {
        const angle = (Math.floor(index / 2) / 32) * Math.PI * 2;
        return index % 2 === 0 ? cx + Math.cos(angle) * rx : cy + Math.sin(angle) * ry;
      });
    }
    return [x1, y1, x2, y2];
  }

  function replayHistory(): void {
    strokes.clear();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const op of history) applyOp(op);
  }

  function applyOp(op: WBOp): void {
    if (op.k === "clear") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.clear();
    } else if (op.k === "start") {
      const strokeTool = op.s.tool ?? "pen";
      const opacity = op.s.opacity ?? 1;
      strokes.set(op.s.id, { color: op.s.color, width: op.s.width, tool: strokeTool, opacity, points: [...op.pts] });
      drawSegment(op.pts, op.s.color, op.s.width, strokeTool, opacity);
    } else if (op.k === "pts") {
      const s = strokes.get(op.id);
      if (!s) return;
      drawSegment([...s.points.slice(-2), ...op.pts], s.color, s.width, s.tool, s.opacity);
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

  /** Remove a stroke everywhere and replay the board from history. */
  function undoStroke(id: string): void {
    const filtered = history.filter(
      (op) => (op.k === "start" ? op.s.id !== id : !("id" in op) || op.id !== id)
    );
    if (filtered.length === history.length) return;
    history.length = 0;
    history.push(...filtered);
    strokes.clear();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const op of history) applyOp(op);
  }
  client.onWbUndo = undoStroke;

  /** My stroke ids in draw order, for undo. */
  const myStrokeIds: string[] = [];
  function undoMyLast(): void {
    const id = myStrokeIds.pop();
    if (!id) return;
    void client.signal.request("wbUndo", { id });
    // The wbUndo push applies the change locally.
  }

  function undoShortcut(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (overlay.classList.contains("hidden")) return;
    e.preventDefault();
    undoMyLast();
  }
  window.addEventListener("keydown", undoShortcut);

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
    myStrokeIds.push(drawingId);
    if (myStrokeIds.length > 200) myStrokeIds.shift();
    const [x, y] = toLocal(e);
    const opacity = tool === "highlighter" ? 0.32 : 1;
    drawing = { color, width, tool, opacity, points: [x, y] };
    pendingPts = [x, y];
    startSent = false;
    strokes.set(drawingId, drawing);
    if (!["line", "rectangle", "ellipse"].includes(tool)) drawSegment([x, y, x + 0.0001, y], color, width, tool, opacity);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const [x, y] = toLocal(e);
    if (["line", "rectangle", "ellipse"].includes(drawing.tool)) {
      const [startX, startY] = drawing.points;
      drawing.points = shapePoints(drawing.tool, startX, startY, x, y);
      pendingPts = [...drawing.points];
      replayHistory();
      drawSegment(drawing.points, drawing.color, drawing.width, drawing.tool, drawing.opacity);
      return;
    }
    const last = drawing.points;
    drawSegment([last.at(-2)!, last.at(-1)!, x, y], drawing.color, drawing.width, drawing.tool, drawing.opacity);
    drawing.points.push(x, y);
    pendingPts.push(x, y);
  });

  function flush(forceShape = false): void {
    if (!drawing || pendingPts.length === 0) return;
    if (["line", "rectangle", "ellipse"].includes(drawing.tool) && !forceShape) return;
    let ops;
    if (!startSent) {
      // The replay history must begin with a "start" op for this stroke.
      ops = [{ k: "start" as const, s: { id: drawingId, color: drawing.color, width: drawing.width, tool: drawing.tool, opacity: drawing.opacity }, pts: pendingPts }];
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
    flush(true);
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


