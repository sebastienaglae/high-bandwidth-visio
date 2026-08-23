import { beforeEach, describe, expect, it } from "vitest";
import { apiUrl, getServerBase, setServerBase, wsUrl } from "../src/env.js";

describe("env / server base", () => {
  beforeEach(() => {
    setServerBase("");
  });

  it("apiUrl is same-origin relative when no server configured", () => {
    expect(apiUrl("/api/new-room")).toBe("/api/new-room");
  });

  it("apiUrl prefixes the configured server", () => {
    setServerBase("https://visio.example.com");
    expect(apiUrl("/api/speedtest")).toBe("https://visio.example.com/api/speedtest");
  });

  it("setServerBase strips trailing slashes", () => {
    setServerBase("https://x.example.com///");
    expect(getServerBase()).toBe("https://x.example.com");
  });

  it("wsUrl upgrades http to ws and https to wss", () => {
    setServerBase("http://lan:9090");
    expect(wsUrl()).toBe("ws://lan:9090/ws");
    setServerBase("https://secure.example.com");
    expect(wsUrl()).toBe("wss://secure.example.com/ws");
    expect(wsUrl("/other")).toBe("wss://secure.example.com/other");
  });

  it("wsUrl falls back to current origin in browser mode", () => {
    setServerBase("");
    // happy-dom default location
    expect(wsUrl()).toMatch(/^ws(s?):\/\//);
  });
});
