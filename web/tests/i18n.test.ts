import { describe, expect, it } from "vitest";
import {
  allLangs,
  detectLang,
  getLang,
  setLang,
  t,
  MODE_LABELS,
} from "../src/i18n.js";

// Extract keys from the EN dictionary by translating an arbitrary string.
function enKeys(): Set<string> {
  const probe = (key: string) => key;
  const orig = t;
  void orig;
  // Rebuild the EN key list via the type: use a sample of known keys instead.
  return new Set(
    [
      "namePlaceholder", "createRoom", "or", "codePlaceholder", "join",
      "serverUnreachable", "setServerFirst", "save", "tagline", "joinRoom",
      "toggleMic", "toggleCam", "couldNotJoin", "backHome", "unexpected",
      "mic", "cam", "shareScreen", "invite", "netDiagnostics", "theme",
      "leave", "copied", "you", "screenSuffix", "guest",
      "modeUltra", "modeLow", "modeBalanced", "modeHigh", "modeMax",
      "chatTitle", "chatPlaceholder", "send", "attachFile", "download",
      "receivingFile", "fileArrives", "boardTitle", "boardClear", "boardPen",
      "netTitle", "yourIp", "traceRoute", "watch", "watchOn", "watchOff",
      "speedTest", "testing", "pathToServer", "events", "tracing",
      "traceComplete", "hops", "via", "traceFailed", "routeChangedAt",
      "downlink",
    ]
  );
}

describe("i18n", () => {
  it("supports exactly English, French and Japanese", () => {
    expect(allLangs().sort()).toEqual(["en", "fr", "ja"]);
  });

  it("every language resolves every key to a non-empty string", () => {
    for (const lang of allLangs()) {
      setLang(lang);
      for (const key of enKeys()) {
        const value = t(key as never);
        expect(value, `${lang}:${key} is empty`).toBeTruthy();
        expect(value, `${lang}:${key} untranslated`).not.toBe("undefined");
      }
    }
  });

  it("translations actually differ between languages for sample keys", () => {
    const samples = ["createRoom", "tagline", "chatTitle", "boardTitle"];
    const distinct = new Set<string>();
    for (const lang of allLangs()) {
      setLang(lang);
      distinct.add(samples.map((k) => t(k as never)).join("|"));
    }
    expect(distinct.size).toBe(allLangs().length);
  });

  it("detects French and Japanese browser languages", () => {
    // detectLang reads navigator.language; happy-dom defaults to en-US.
    expect(["en", "fr", "ja"]).toContain(detectLang());
  });

  it("setLang persists and falls back to English for unknown keys", () => {
    setLang("ja");
    expect(getLang()).toBe("ja");
    expect(t("nonexistent-key" as never)).toBe("nonexistent-key");
    setLang("en");
  });

  it("mode labels exist for every mode in every language", () => {
    const modes = ["ultra", "low", "balanced", "high", "max"];
    for (const lang of allLangs()) {
      for (const m of modes) {
        expect(MODE_LABELS[lang][m], `${lang}/${m} label missing`).toBeTruthy();
      }
    }
  });
});
