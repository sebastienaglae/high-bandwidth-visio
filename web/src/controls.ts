import { icon } from "./icons.js";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

let openSelect: CustomSelect<any> | null = null;

/** Accessible application-styled select with native-select keyboard behavior. */
export class CustomSelect<T extends string = string> {
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly listbox: HTMLDivElement;
  private labelNode: HTMLSpanElement;
  private options: SelectOption<T>[] = [];
  private optionNodes: HTMLButtonElement[] = [];
  private activeIndex = -1;
  private selectedValue: T;
  private search = "";
  private searchTimer = 0;
  onChange: ((value: T) => void) | null = null;

  constructor(label: string, options: SelectOption<T>[], value: T, className = "") {
    this.selectedValue = value;
    this.labelNode = document.createElement("span");
    this.labelNode.className = "custom-select-value";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "custom-select-trigger";
    this.button.setAttribute("aria-label", label);
    this.button.setAttribute("role", "combobox");
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.setAttribute("aria-expanded", "false");
    this.button.append(this.labelNode, icon("chevron-down", 14));
    this.listbox = document.createElement("div");
    this.listbox.className = "custom-select-listbox";
    this.listbox.id = `select-listbox-${crypto.randomUUID()}`;
    this.listbox.setAttribute("role", "listbox");
    this.listbox.setAttribute("aria-label", label);
    this.listbox.hidden = true;
    this.button.setAttribute("aria-controls", this.listbox.id);
    this.root = document.createElement("div");
    this.root.className = `custom-select ${className}`.trim();
    this.root.append(this.button, this.listbox);
    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("keydown", (event) => this.onTriggerKey(event));
    this.listbox.addEventListener("keydown", (event) => this.onListKey(event));
    this.setOptions(options, value);
  }

  get value(): T { return this.selectedValue; }

  set value(value: T) { this.select(value, false); }

  setOptions(options: SelectOption<T>[], value: T = this.selectedValue): void {
    this.options = [...options];
    this.listbox.replaceChildren();
    this.optionNodes = options.map((option, index) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "custom-select-option";
      node.id = `select-option-${crypto.randomUUID()}`;
      node.setAttribute("role", "option");
      node.tabIndex = -1;
      node.setAttribute("aria-selected", String(option.value === value));
      if (option.disabled) {
        node.disabled = true;
        node.setAttribute("aria-disabled", "true");
      }
      const text = document.createElement("span");
      text.textContent = option.label;
      node.append(text);
      if (option.description) {
        const detail = document.createElement("small");
        detail.textContent = option.description;
        node.append(detail);
      }
      node.addEventListener("pointermove", () => this.setActive(index, false));
      node.addEventListener("click", () => this.select(option.value, true));
      this.listbox.append(node);
      return node;
    });
    const fallback = options.find((option) => !option.disabled)?.value;
    this.selectedValue = options.some((option) => option.value === value) ? value : (fallback ?? value);
    this.renderSelection();
  }

  open(): void {
    if (this.button.disabled || !this.listbox.hidden) return;
    if (openSelect && openSelect !== this) openSelect.close(false);
    openSelect = this;
    this.listbox.hidden = false;
    this.root.classList.add("open");
    this.button.setAttribute("aria-expanded", "true");
    const selected = Math.max(0, this.options.findIndex((option) => option.value === this.selectedValue));
    this.setActive(selected, true);
    document.addEventListener("pointerdown", this.onOutside, true);
  }

  close(restoreFocus = true): void {
    if (this.listbox.hidden) return;
    this.listbox.hidden = true;
    this.root.classList.remove("open");
    this.button.setAttribute("aria-expanded", "false");
    this.button.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", this.onOutside, true);
    if (openSelect === this) openSelect = null;
    if (restoreFocus) this.button.focus();
  }

  toggle(): void { this.listbox.hidden ? this.open() : this.close(); }

  private onOutside = (event: PointerEvent): void => {
    if (!this.root.contains(event.target as Node)) this.close(false);
  };

  private select(value: T, notify: boolean): void {
    const option = this.options.find((item) => item.value === value && !item.disabled);
    if (!option) return;
    const changed = value !== this.selectedValue;
    this.selectedValue = value;
    this.renderSelection();
    this.close();
    if (changed && notify) this.onChange?.(value);
  }

  private renderSelection(): void {
    const selected = this.options.find((option) => option.value === this.selectedValue);
    this.labelNode.textContent = selected?.label ?? this.selectedValue;
    this.optionNodes.forEach((node, index) => {
      const isSelected = this.options[index]?.value === this.selectedValue;
      node.setAttribute("aria-selected", String(isSelected));
      node.classList.toggle("selected", isSelected);
      node.querySelector("svg")?.remove();
      if (isSelected) node.append(icon("check", 14));
    });
  }

  private setActive(index: number, focus: boolean): void {
    if (!this.optionNodes.length) return;
    let next = index;
    while (this.options[next]?.disabled) next = (next + 1) % this.options.length;
    this.activeIndex = next;
    this.optionNodes.forEach((node, i) => node.classList.toggle("active", i === next));
    const active = this.optionNodes[next];
    this.button.setAttribute("aria-activedescendant", active.id);
    if (focus) active.focus();
  }

  private move(delta: number): void {
    let next = this.activeIndex;
    do next = (next + delta + this.options.length) % this.options.length;
    while (this.options[next]?.disabled && next !== this.activeIndex);
    this.setActive(next, true);
  }

  private onTriggerKey(event: KeyboardEvent): void {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      this.open();
      if (event.key === "ArrowUp") this.move(-1);
    }
  }

  private onListKey(event: KeyboardEvent): void {
    if (event.key === "Escape" || (event.key === "Tab" && !event.shiftKey)) {
      if (event.key === "Escape") event.preventDefault();
      this.close(event.key === "Escape");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.setActive(event.key === "Home" ? 0 : this.options.length - 1, true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = this.options[this.activeIndex];
      if (option) this.select(option.value, true);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      clearTimeout(this.searchTimer);
      this.search += event.key.toLocaleLowerCase();
      this.searchTimer = window.setTimeout(() => (this.search = ""), 500);
      const index = this.options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(this.search));
      if (index >= 0) this.setActive(index, true);
    }
  }
}

/** Styled checkbox that preserves checkbox semantics without native browser chrome. */
export function customCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "custom-checkbox";
  control.setAttribute("role", "checkbox");
  const box = document.createElement("span");
  box.className = "custom-checkbox-box";
  const text = document.createElement("span");
  text.className = "custom-checkbox-label";
  text.textContent = label;
  const render = (): void => {
    control.setAttribute("aria-checked", String(checked));
    box.replaceChildren(...(checked ? [icon("check", 13)] : []));
  };
  control.addEventListener("click", () => {
    checked = !checked;
    render();
    onChange(checked);
  });
  control.append(box, text);
  render();
  return control;
}
