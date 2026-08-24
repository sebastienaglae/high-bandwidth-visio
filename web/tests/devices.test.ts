import { describe, expect, it } from "vitest";
import { pickDevice, deviceLabel } from "../src/devices.js";

const cam = (id: string, label = ""): MediaDeviceInfo =>
  ({ deviceId: id, kind: "videoinput", label, groupId: "g", toJSON: () => ({}) }) as unknown as MediaDeviceInfo;

describe("pickDevice", () => {
  const devs = [cam("d1"), cam("d2"), cam("d3")];

  it("prefers the saved device when still present", () => {
    expect(pickDevice(devs, "d2")).toBe("d2");
  });

  it("falls back to the first device when the saved one vanished", () => {
    expect(pickDevice(devs, "gone")).toBe("d1");
  });

  it("returns undefined with no devices", () => {
    expect(pickDevice([], "d1")).toBeUndefined();
    expect(pickDevice([], null)).toBeUndefined();
  });

  it("uses the first device when nothing saved", () => {
    expect(pickDevice(devs, null)).toBe("d1");
  });
});

describe("deviceLabel", () => {
  it("uses the device label when present", () => {
    expect(deviceLabel(cam("d1", "Logitech Brio"), 0)).toBe("Logitech Brio");
  });

  it("falls back to a friendly numbered name", () => {
    expect(deviceLabel(cam("d1"), 0)).toBe("Camera 1");
    expect(deviceLabel({ ...cam("d2"), kind: "audioinput" } as MediaDeviceInfo, 2)).toBe("Microphone 3");
  });
});
