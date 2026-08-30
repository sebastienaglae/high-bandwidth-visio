import { describe, expect, it, vi } from "vitest";
import { CustomSelect, customCheckbox } from "../src/controls.js";

describe("CustomSelect", () => {
  it("selects by pointer and closes after selection", () => {
    const changed = vi.fn();
    const select = new CustomSelect("Language", [{ value: "en", label: "English" }, { value: "fr", label: "Français" }], "en");
    select.onChange = changed;
    document.body.append(select.root);
    select.button.click();
    expect(select.button.getAttribute("aria-expanded")).toBe("true");
    select.listbox.querySelectorAll("button")[1].click();
    expect(select.value).toBe("fr");
    expect(changed).toHaveBeenCalledWith("fr");
    expect(select.listbox.hidden).toBe(true);
  });

  it("supports arrows, enter and escape", () => {
    const select = new CustomSelect("Quality", [{ value: "low", label: "Low" }, { value: "high", label: "High" }], "low");
    document.body.append(select.root);
    select.button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    select.listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    select.listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(select.value).toBe("high");
    select.open();
    select.listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(select.listbox.hidden).toBe(true);
  });

  it("closes when pointer interaction occurs outside", () => {
    const select = new CustomSelect("Language", [{ value: "en", label: "English" }], "en");
    document.body.append(select.root);
    select.open();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(select.listbox.hidden).toBe(true);
  });

  it("keeps only one dropdown open", () => {
    const first = new CustomSelect("First", [{ value: "a", label: "A" }], "a");
    const second = new CustomSelect("Second", [{ value: "b", label: "B" }], "b");
    document.body.append(first.root, second.root);
    first.open();
    second.open();
    expect(first.listbox.hidden).toBe(true);
    expect(second.listbox.hidden).toBe(false);
  });
});

describe("customCheckbox", () => {
  it("has checkbox semantics and toggles from the button", () => {
    const changed = vi.fn();
    const checkbox = customCheckbox("Encryption", false, changed);
    checkbox.click();
    expect(checkbox.getAttribute("role")).toBe("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(changed).toHaveBeenCalledWith(true);
  });
});
