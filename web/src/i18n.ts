// Full EN / FR / JA localization.

export type Lang = "en" | "fr" | "ja";
const LANGS: Lang[] = ["en", "fr", "ja"];

const EN = {
  // landing
  namePlaceholder: "Your name",
  createRoom: "Create room",
  or: "or",
  codePlaceholder: "Room link or code",
  join: "Join",
  serverUnreachable: "Server unreachable",
  setServerFirst: "Set server first",
  save: "Save",
  tagline: "High-bandwidth video meetings, relayed for minimal latency.",
  // pre-join
  joinRoom: "Join room",
  toggleMic: "Toggle microphone",
  toggleCam: "Toggle camera",
  // errors
  couldNotJoin: "Could not join",
  backHome: "Back to home",
  unexpected: "Unexpected error while joining the room.",
  // controls
  mic: "Microphone",
  cam: "Camera",
  shareScreen: "Share a screen or window",
  invite: "Copy invite link",
  netDiagnostics: "Network diagnostics",
  theme: "Toggle theme",
  leave: "Leave the room",
  reconnecting: "Reconnecting…",
  host: "Host",
  mutePeer: "Mute participant",
  kickPeer: "Remove participant",
  lockRoom: "Lock the room",
  unlockRoom: "Unlock the room",
  youWereMuted: "You were muted by the host",
  kickedTitle: "Removed from the room",
  kickedDetail: "The host removed you from this meeting.",
  roomNowLocked: "The room is now locked",
  selectCamera: "Camera",
  selectMic: "Microphone",
  copied: "Copied",
  you: "you",
  screenSuffix: "screen",
  guest: "Guest",
  // modes
  modeUltra: "Ultra",
  modeLow: "Low",
  modeBalanced: "Balanced",
  modeHigh: "High",
  modeMax: "Max",
  // chat
  chatTitle: "Chat",
  chatPlaceholder: "Write a message…",
  send: "Send",
  attachFile: "Share a file (temporary)",
  download: "Download",
  receivingFile: "Receiving",
  fileArrives: "shared a file",
  // whiteboard
  boardTitle: "Whiteboard",
  boardClear: "Clear the whiteboard",
  boardPen: "Pen",
  // network panel
  netTitle: "Network",
  yourIp: "Your IP",
  traceRoute: "Trace route",
  watch: "Watch",
  watchOn: "Route watch on (30s)",
  watchOff: "Route watch off",
  speedTest: "Speed test",
  testing: "Testing…",
  pathToServer: "Path to server",
  events: "Events",
  tracing: "Tracing…",
  traceComplete: "Trace complete",
  hops: "hops",
  via: "via",
  traceFailed: "Trace failed",
  routeChangedAt: "Route changed at",
  downlink: "Downlink",
};

type Dict = typeof EN;

const FR: Dict = {
  namePlaceholder: "Votre nom",
  createRoom: "Créer un salon",
  or: "ou",
  codePlaceholder: "Lien ou code du salon",
  join: "Rejoindre",
  serverUnreachable: "Serveur injoignable",
  setServerFirst: "Configurez le serveur",
  save: "Enregistrer",
  tagline: "Visioconférence haut débit, relayée pour une latence minimale.",
  joinRoom: "Rejoindre le salon",
  toggleMic: "Activer / couper le micro",
  toggleCam: "Activer / couper la caméra",
  couldNotJoin: "Impossible de rejoindre",
  backHome: "Retour à l'accueil",
  unexpected: "Erreur inattendue lors de la connexion au salon.",
  mic: "Microphone",
  cam: "Caméra",
  shareScreen: "Partager un écran ou une fenêtre",
  invite: "Copier le lien d'invitation",
  netDiagnostics: "Diagnostic réseau",
  theme: "Changer de thème",
  leave: "Quitter le salon",
  reconnecting: "Reconnexion…",
  host: "Hôte",
  mutePeer: "Couper le micro du participant",
  kickPeer: "Retirer le participant",
  lockRoom: "Verrouiller le salon",
  unlockRoom: "Déverrouiller le salon",
  youWereMuted: "Vous avez été coupé par l'hôte",
  kickedTitle: "Retiré du salon",
  kickedDetail: "L'hôte vous a retiré de cette réunion.",
  roomNowLocked: "Le salon est désormais verrouillé",
  selectCamera: "Caméra",
  selectMic: "Microphone",
  copied: "Copié",
  you: "vous",
  screenSuffix: "écran",
  guest: "Invité",
  modeUltra: "Ultra",
  modeLow: "Bas",
  modeBalanced: "Équilibré",
  modeHigh: "Haut",
  modeMax: "Max",
  chatTitle: "Discussion",
  chatPlaceholder: "Écrivez un message…",
  send: "Envoyer",
  attachFile: "Partager un fichier (temporaire)",
  download: "Télécharger",
  receivingFile: "Réception",
  fileArrives: "a partagé un fichier",
  boardTitle: "Tableau blanc",
  boardClear: "Effacer le tableau",
  boardPen: "Stylo",
  netTitle: "Réseau",
  yourIp: "Votre IP",
  traceRoute: "Tracer la route",
  watch: "Surveiller",
  watchOn: "Surveillance activée (30 s)",
  watchOff: "Surveillance désactivée",
  speedTest: "Test de débit",
  testing: "Test en cours…",
  pathToServer: "Route vers le serveur",
  events: "Événements",
  tracing: "Tracé en cours…",
  traceComplete: "Tracé terminé",
  hops: "sauts",
  via: "via",
  traceFailed: "Échec du tracé",
  routeChangedAt: "Route modifiée à",
  downlink: "Descendant",
};

const JA: Dict = {
  namePlaceholder: "名前",
  createRoom: "ルームを作成",
  or: "または",
  codePlaceholder: "ルームのリンクまたはコード",
  join: "参加",
  serverUnreachable: "サーバーに接続できません",
  setServerFirst: "サーバーを設定してください",
  save: "保存",
  tagline: "大容量帯域を活かす、低遅延ビデオ会議。",
  joinRoom: "ルームに参加",
  toggleMic: "マイクのオン / オフ",
  toggleCam: "カメラのオン / オフ",
  couldNotJoin: "参加できませんでした",
  backHome: "ホームに戻る",
  unexpected: "ルームへの参加中に予期しないエラーが発生しました。",
  mic: "マイクロフォン",
  cam: "カメラ",
  shareScreen: "画面やウィンドウを共有",
  invite: "招待リンクをコピー",
  netDiagnostics: "ネットワーク診断",
  theme: "テーマを切り替え",
  leave: "退室する",
  reconnecting: "再接続中…",
  host: "ホスト",
  mutePeer: "参加者のマイクをオフ",
  kickPeer: "参加者を退出させる",
  lockRoom: "ルームをロック",
  unlockRoom: "ロックを解除",
  youWereMuted: "ホストによってミュートされました",
  kickedTitle: "ルームから退出されました",
  kickedDetail: "ホストがあなたをこのミーティングから削除しました。",
  roomNowLocked: "ルームはロックされました",
  selectCamera: "カメラ",
  selectMic: "マイク",
  copied: "コピーしました",
  you: "自分",
  screenSuffix: "画面",
  guest: "ゲスト",
  modeUltra: "超低遅延",
  modeLow: "低遅延",
  modeBalanced: "バランス",
  modeHigh: "高画質",
  modeMax: "最高品質",
  chatTitle: "チャット",
  chatPlaceholder: "メッセージを入力…",
  send: "送信",
  attachFile: "ファイルを共有（一時的）",
  download: "ダウンロード",
  receivingFile: "受信中",
  fileArrives: "がファイルを共有しました",
  boardTitle: "ホワイトボード",
  boardClear: "全消し",
  boardPen: "ペン",
  netTitle: "ネットワーク",
  yourIp: "あなたの IP",
  traceRoute: "経路をトレース",
  watch: "監視",
  watchOn: "経路監視オン（30秒）",
  watchOff: "経路監視オフ",
  speedTest: "速度測定",
  testing: "測定中…",
  pathToServer: "サーバーへの経路",
  events: "イベント",
  tracing: "トレース中…",
  traceComplete: "トレース完了",
  hops: "ホップ",
  via: "経由",
  traceFailed: "トレース失敗",
  routeChangedAt: "経路が変更されました",
  downlink: "下り",
};

const DICTS: Record<Lang, Dict> = { en: EN, fr: FR, ja: JA };

let current: Lang = detectLang();

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem("visio:lang") as Lang | null;
    if (stored && LANGS.includes(stored)) return stored;
  } catch {
    /* no storage */
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try {
    localStorage.setItem("visio:lang", lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
}

export function t(key: keyof Dict): string {
  return DICTS[current][key] ?? DICTS.en[key] ?? String(key);
}

export function allLangs(): Lang[] {
  return [...LANGS];
}

/** Localized short labels + descriptions per quality mode. */
export const MODE_LABELS: Record<Lang, Record<string, string>> = {
  en: { ultra: "Ultra", low: "Low", balanced: "Balanced", high: "High", max: "Max" },
  fr: { ultra: "Ultra", low: "Bas", balanced: "Équilibré", high: "Haut", max: "Max" },
  ja: { ultra: "超低遅延", low: "低遅延", balanced: "バランス", high: "高画質", max: "最高" },
};


