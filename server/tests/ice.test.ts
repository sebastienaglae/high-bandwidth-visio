import { describe, expect, it } from "vitest";
import { buildIceServers } from "../src/ice.js";

describe("buildIceServers", () => {
  it("returns empty when nothing configured", () => {
    expect(buildIceServers({})).toEqual([]);
  });

  it("parses the JSON form", () => {
    const env = {
      ICE_SERVERS:
        '[{"urls":"turn:t.example.com:3478","username":"u","credential":"p"},{"urls":["stun:stun.l.google.com:19302"]}]',
    };
    const out = buildIceServers(env);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ urls: "turn:t.example.com:3478", username: "u", credential: "p" });
    expect(out[1].urls).toEqual(["stun:stun.l.google.com:19302"]);
  });

  it("drops malformed JSON entries instead of throwing", () => {
    const env = { ICE_SERVERS: '[{"nope":true},{"urls":"turn:ok:3478"}]' };
    const out = buildIceServers(env);
    expect(out).toEqual([{ urls: "turn:ok:3478" }]);
  });

  it("falls back to the simple TURN_* form", () => {
    const env = {
      TURN_URLS: "turn:1.2.3.4:3478?transport=udp, turn:1.2.3.4:3478?transport=tcp",
      TURN_USERNAME: "visio",
      TURN_CREDENTIAL: "s3cret",
    };
    expect(buildIceServers(env)).toEqual([
      {
        urls: ["turn:1.2.3.4:3478?transport=udp", "turn:1.2.3.4:3478?transport=tcp"],
        username: "visio",
        credential: "s3cret",
      },
    ]);
  });

  it("ignores TURN_URLS without a username", () => {
    expect(buildIceServers({ TURN_URLS: "turn:1.2.3.4:3478" })).toEqual([]);
  });

  it("ignores invalid JSON silently", () => {
    expect(buildIceServers({ ICE_SERVERS: "not json" })).toEqual([]);
  });
});
