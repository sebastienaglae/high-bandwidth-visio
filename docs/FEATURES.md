# Feature inventory — pages & surfaces

Every user-facing surface in visio, with the features it carries.

## 1. Landing — `/`

| Feature | Notes |
|---|---|
| Create room | Server generates a ~128-bit token; redirects to `/j/<token>` |
| Join by link or code | Accepts a full URL or a raw token, validated client- and server-side |
| Display name | Persisted in `localStorage`, max 32 chars |
| Language selector | English / Français / 日本語, auto-detected, persisted |
| Theme toggle | Warm-cream light / umber-charcoal dark, no flash on load |
| Desktop only: server card | SFU address config, `/healthz` check, hardware report (CPU, GPU, RAM) |

## 2. Pre-join — `/j/:token`

| Feature | Notes |
|---|---|
| Live camera preview | Saved camera/mic, mirrored |
| Device pickers | Camera & microphone dropdowns when multiple devices exist; choice persisted |
| Mic / cam toggles | State carried into the room |
| Name confirmation | Falls back to "Guest" |
| Graceful degradation | Denied camera still allows joining |

## 3. Room — in-call

### Video grid
- Auto-fit tile layout, 16:9 tiles
- Self-view mirrored; remote tiles labeled with display name
- Multiple simultaneous screen shares — one tile per share, each with its own 3-layer simulcast (up to 30 Mbps)
- Stop button on your own screen tiles
- Tiles removed on peer leave / producer close

### Controls bar (auto-fades after 4 s idle)
- Five quality/latency modes — Ultra → Max — switched live: capture constraints (uplink), preferred simulcast layers (downlink), jitter buffer target (receiver)
- Microphone / camera mute (pause + disable)
- Add screen share (each click shares another screen/window)
- Chat toggle, whiteboard toggle, invite-link copy, network panel, theme, leave

### Chat panel
- Real-time messages over an SCTP data channel (no HTTP)
- Temporary file sharing: 60 KB binary frames, SCTP backpressure-aware, reassembled client-side into download chips — never persisted server-side
- Sender/receiver naming, system lines for transfers

### Whiteboard overlay
- Vector strokes, 5 colors, 3 widths, clear-all
- Ops batched ~50 ms, server-validated (colors, normalized coords, caps)
- Full history replay on resize; join-time snapshot from server (capped 1500 ops)

### Network panel
- RTT sparkline (WebSocket ping, 1 s cadence, 90-sample window)
- Media stats: uplink/downlink bitrate, RTT, jitter, packet loss from live WebRTC `getStats()`
- Traceroute from the SFU to you: hops enriched with ASN / organization / country (Team Cymru DNS, 24 h cache)
- Route watch: re-trace every 30 s, push notification on path change
- Download speed test (throttled once / 30 s per IP)

### Moderation & presence
- First participant becomes host; host migrates automatically on leave/disconnect
- Host can mute a participant (server-side producer pause + notification),
  remove a participant, and lock/unlock the room (locked rooms reject joins)
- Active-speaker highlighting (server audio-level observer → tile outline)
- Per-tile connection quality (good/mid/low from inbound RTP loss & jitter)

### Errors
- Styled failure screen ("Could not join" + reason) instead of a dead page

### Resilience
- Automatic signaling reconnection with exponential backoff (8 tries)
- Session resume: a dropped WebSocket no longer ends the call — media keeps
  flowing during a 15 s grace window, then the client re-attaches with the
  same identity and reconciles peers/media/whiteboard state
- Visible "Reconnecting…" banner during drops
- Optional TURN relay (`/api/rtc-config`, compose profile `turn`) for
  symmetric-NAT participants

## 4. Desktop app (Tauri v2 — Windows / macOS)

- Native window, GPU-accelerated WebView, perf browser flags
- SFU address persisted in app config; hardware capability report
- Invite links copy the public SFU URL, not the internal window URL
- MSI / DMG bundles

## 5. Server (no UI, but user-visible behavior)

- mediasoup SFU — RTP forwarded, never transcoded
- Ephemeral rooms (closed when last participant leaves)
- Rate limiting (60 signaling msg/s per connection, per-IP HTTP limits), capacity caps, security headers, graceful shutdown, production boot guard
- `/healthz`, `/api/new-room`, `/api/speedtest`

