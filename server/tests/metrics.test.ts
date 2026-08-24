import { describe, expect, it } from "vitest";
import { formatPrometheus } from "../src/metrics.js";
import type { GlobalStats } from "../src/rooms.js";

const sample: GlobalStats = {
  rooms: 2,
  peers: 5,
  producers: 9,
  consumers: 16,
  dataProducers: 4,
  workers: 2,
  lockedRooms: 1,
  perRoom: [
    { id: "roomA", peers: 3, locked: false },
    { id: "roomB", peers: 2, locked: true },
  ],
};

describe("formatPrometheus", () => {
  it("emits HELP/TYPE/sample triplets for every metric", () => {
    const out = formatPrometheus(sample, { uptimeSec: 42.4, heapBytes: 12345 });
    for (const name of [
      "visio_rooms",
      "visio_peers",
      "visio_producers",
      "visio_consumers",
      "visio_data_producers",
      "visio_locked_rooms",
      "visio_workers",
      "visio_process_uptime_seconds",
      "visio_memory_heap_bytes",
    ]) {
      expect(out).toContain(`# TYPE ${name} gauge`);
      expect(out).toMatch(new RegExp(`^${name} \\d+$`, "m"));
    }
  });

  it("ends with a newline (Prometheus requirement)", () => {
    expect(formatPrometheus(sample, { uptimeSec: 1, heapBytes: 1 }).endsWith("\n")).toBe(true);
  });

  it("emits labeled per-room peers", () => {
    const out = formatPrometheus(sample, { uptimeSec: 1, heapBytes: 1 });
    expect(out).toContain('visio_room_peers{room="roomA",locked="false"} 3');
    expect(out).toContain('visio_room_peers{room="roomB",locked="true"} 2');
  });

  it("rounds uptime to whole seconds", () => {
    const out = formatPrometheus(sample, { uptimeSec: 99.9, heapBytes: 1 });
    expect(out).toContain("visio_process_uptime_seconds 100");
  });

  it("handles an empty deployment", () => {
    const out = formatPrometheus(
      { ...sample, rooms: 0, peers: 0, producers: 0, consumers: 0, dataProducers: 0, lockedRooms: 0, perRoom: [] },
      { uptimeSec: 0, heapBytes: 0 }
    );
    expect(out).toContain("visio_rooms 0");
    expect(out).not.toContain("visio_room_peers");
  });
});
