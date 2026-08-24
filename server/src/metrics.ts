import type { GlobalStats } from "./rooms.js";

/**
 * Render stats in Prometheus text exposition format.
 * Pure function over the stats snapshot — unit tested.
 */
export function formatPrometheus(
  s: GlobalStats,
  proc: { uptimeSec: number; heapBytes: number }
): string {
  const lines: string[] = [];
  const gauge = (name: string, help: string, value: number, labels = ""): void => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name}${labels} ${value}`);
  };

  gauge("visio_rooms", "Active rooms.", s.rooms);
  gauge("visio_peers", "Connected peers.", s.peers);
  gauge("visio_producers", "Media producers across all rooms.", s.producers);
  gauge("visio_consumers", "Media consumers across all rooms.", s.consumers);
  gauge("visio_data_producers", "Data producers (chat/files/whiteboard).", s.dataProducers);
  gauge("visio_locked_rooms", "Rooms currently locked by the host.", s.lockedRooms);
  gauge("visio_workers", "Running mediasoup workers.", s.workers);
  gauge("visio_process_uptime_seconds", "Server uptime in seconds.", Math.round(proc.uptimeSec));
  gauge("visio_memory_heap_bytes", "Node.js heap in use.", proc.heapBytes);

  for (const r of s.perRoom) {
    gauge(
      "visio_room_peers",
      "Peers per room.",
      r.peers,
      `{room="${r.id}",locked="${r.locked}"}`
    );
  }

  return lines.join("\n") + "\n";
}
