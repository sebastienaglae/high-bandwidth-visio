// Minimal stroke icon set — 24px viewBox, inherits currentColor.

const PATHS: Record<string, string> = {
  mic:
    '<path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>' +
    '<path d="M19 10v1a7 7 0 0 1-14 0v-1"/>' +
    '<line x1="12" y1="18" x2="12" y2="22"/>',
  "mic-off":
    '<path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>' +
    '<path d="M9 9v2a3 3 0 0 0 5.12 2.12"/>' +
    '<path d="M19 10v1a7 7 0 0 1-.12 1.26"/>' +
    '<path d="M5 10v1a7 7 0 0 0 11.24 5.58"/>' +
    '<line x1="12" y1="18" x2="12" y2="22"/>' +
    '<line x1="3" y1="3" x2="21" y2="21"/>',
  cam:
    '<rect x="1" y="6" width="14" height="12" rx="2.5"/>' +
    '<path d="m15 10 6-3.5v11L15 14"/>',
  "cam-off":
    '<path d="M10.5 6H13a2 2 0 0 1 2 2v4.5"/>' +
    '<path d="M19.5 8.5 21 7.5v9L17 14"/>' +
    '<path d="M15 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5"/>' +
    '<line x1="3" y1="3" x2="21" y2="21"/>',
  screen:
    '<rect x="2" y="3" width="20" height="13" rx="2"/>' +
    '<path d="M12 6.5v5"/><path d="m9.5 9 2.5-2.5L14.5 9"/>' +
    '<path d="M8 20h8"/><path d="M12 16.5V20"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.54.54l2.83-2.83a5 5 0 0 0-7.07-7.07L11.75 5.2"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-2.83 2.83a5 5 0 0 0 7.07 7.07l1.55-1.56"/>',
  activity:
    '<path d="M22 12h-3.5l-3 8.5-6-17-3 8.5H2"/>',
  leave:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
    '<polyline points="16 17 21 12 16 7"/>' +
    '<line x1="21" y1="12" x2="9" y2="12"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/>' +
    '<path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/>' +
    '<path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
  moon:
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  check:
    '<polyline points="20 6 9 17 4 12"/>',
  chat:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pen:
    '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>' +
    '<path d="m15 5 4 4"/>',
  send:
    '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  file:
    '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  x:
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  lock:
    '<rect x="5" y="11" width="14" height="10" rx="2"/>' +
    '<path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock:
    '<rect x="5" y="11" width="14" height="10" rx="2"/>' +
    '<path d="M8 11V7a4 4 0 0 1 7.5-1.9"/>',
  star:
    '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9L12 3z"/>',
  record:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  stop:
    '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  grid:
    '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/>' +
    '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  speaker:
    '<rect x="3" y="3" width="13" height="18" rx="2"/>' +
    '<rect x="18" y="3" width="3" height="8" rx="1"/>' +
    '<rect x="18" y="13" width="3" height="8" rx="1"/>',
  pin:
    '<path d="M12 17v5"/>' +
    '<path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.3V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.7a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>',
};

export function icon(name: keyof typeof PATHS | string, size = 18): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = PATHS[name] ?? "";
  return svg;
}
