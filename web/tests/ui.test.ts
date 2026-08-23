import { describe, expect, it } from "vitest";
import { icon } from "../src/icons.js";
import { hopRow } from "../src/netpanel.js";

describe("icon()", () => {
  it("creates an SVG with the icon class and 24px viewBox", () => {
    const svg = icon("mic");
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.classList.contains("icon")).toBe(true);
  });

  it("applies requested size", () => {
    expect(icon("cam", 24).getAttribute("width")).toBe("24");
  });

  it("renders known icons with paths", () => {
    expect(icon("mic").innerHTML.length).toBeGreaterThan(0);
    for (const name of ["mic-off", "cam", "cam-off", "screen", "link", "activity", "leave", "sun", "moon", "check"]) {
      expect(icon(name).innerHTML.length, `${name} has no path`).toBeGreaterThan(0);
    }
  });

  it("renders empty for unknown names (never throws)", () => {
    const svg = icon("does-not-exist");
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(svg.innerHTML).toBe("");
  });
});

describe("hopRow rendering", () => {
  it("shows hop number, ip, rtt, org and country", () => {
    const row = hopRow({ hop: 4, ip: "171.75.8.225", rttMs: 15.3, org: "LEVEL3", country: "GB" });
    expect(row.textContent).toContain("#4");
    expect(row.textContent).toContain("171.75.8.225");
    expect(row.textContent).toContain("15.3 ms");
    expect(row.textContent).toContain("LEVEL3");
    expect(row.textContent).toContain("GB");
    // no emoji anywhere
    expect(/\p{Extended_Pictographic}/u.test(row.textContent ?? "")).toBe(false);
  });

  it("marks timeout hops and hides missing fields", () => {
    const row = hopRow({ hop: 3, ip: null, rttMs: null });
    expect(row.classList.contains("timeout")).toBe(true);
    expect(row.textContent).toContain("* * *");
    expect(row.textContent).not.toContain("ms");
  });

  it("omits the country when private/unknown", () => {
    const row = hopRow({ hop: 1, ip: "192.168.1.1", rttMs: 1, org: "Private network", country: "--" });
    expect(row.textContent).not.toContain("--");
  });
});
