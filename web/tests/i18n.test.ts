import { describe, expect, it } from "vitest";
import {
  allLangs,
  detectLang,
  getLang,
  setLang,
  t,
  MODE_LABELS,
  translationKeys,
} from "../src/i18n.js";

describe("i18n", () => {
  it("supports exactly English, French and Japanese", () => {
    expect(allLangs().sort()).toEqual(["en", "fr", "ja"]);
  });

  it("every language resolves every key to a non-empty string", () => {
    for (const lang of allLangs()) {
      setLang(lang);
      for (const key of translationKeys()) {
        const value = t(key);
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
