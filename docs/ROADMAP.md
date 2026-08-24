# Enhancement roadmap

Ideas ranked roughly by impact-to-effort within each area. Checked items
would be natural next milestones.

## Media & quality

- [ ] Device pickers — choose camera/mic/output; handle hot-plug
- [ ] Virtual backgrounds & blur via WebGPU (client-side, zero server cost)
- [ ] AV1 encode path + SVC (L3T3_KEY) end-to-end; codec preference UI
- [ ] Active-speaker detection (audio-level observer) + spotlight layout
- [ ] Layout modes: grid / speaker / filmstrip; pin & mute-others (host)
- [ ] Local recording (MediaRecorder) and server-side recording
- [ ] RTMP/streaming output for webinars
- [ ] Hi-fi audio mode: 5.1 Opus, no DTX, full-band stereo music
- [ ] Live captions (local Whisper wasm or WebSpeech) per language
- [ ] E2EE via Insertable Streams (SFU stays key-blind)
- [ ] Reactions & raise-hand (data channel, no emoji in chrome — in-tile badges)

## Connection & resilience

- [ ] Automatic reconnection: ICE restarts, transport replacement, session
      resume after WS drop (currently a dropped WS ends the call)
- [ ] TURN/COTURN deployment profile for symmetric-NAT participants
- [ ] Multi-SFU cascading (PipeTransport) + regional SFU selection by RTT
- [ ] Pre-join bandwidth test to pick the default mode automatically
- [ ] TCP/TLS fallback (mediasoup listens on TCP already) for UDP-blocked networks
- [ ] IPv6 dual-stack listening + candidates

## Chat, files, whiteboard

- [ ] File transfer: progress bars, cancel, size cap negotiation, drag & drop,
      image paste with inline preview
- [ ] Markdown rendering in chat (code blocks especially)
- [ ] Whiteboard: shapes, text, eraser, undo/redo, multi-page, PNG/PDF export
- [ ] Whiteboard "laser pointer" mode and follow-the-presenter view
- [ ] Optional message history persistence (off by default)

## Network tools (differentiator)

- [ ] Continuous MTR-style loss/latency per hop, not just snapshot RTT
- [ ] Route-change world map visualization (hop geo-coordinates)
- [ ] getStats JSON export / webrtc-internals-style dump for bug reports
- [ ] Audible + visual alert on route change during a call
- [ ] Compare paths: client→SFU vs client→client (P2P probe)

## Security & moderation

- [ ] Host controls: mute participant, remove participant, lock room
- [ ] Waiting room / lobby with admit-deny
- [ ] Optional room password in addition to link secrecy
- [ ] Expiring, signed invite links (HMAC + TTL)
- [ ] Admin dashboard: live rooms, bitrates, kick, per-IP stats
- [ ] Audit log for moderation actions

## Desktop (native performance track)

- [ ] N2: native capture — Windows Graphics Capture + macOS ScreenCaptureKit
- [ ] N3: hardware encode — Media Foundation (QSV/NVENC/AMF) & VideoToolbox,
      RTP into mediasoup PlainTransport (4K60+, many monitors, low CPU)
- [ ] N4: wgpu-powered background effects off the main thread
- [ ] Global mute/PTT hotkeys, system tray, close-to-tray
- [ ] Auto-update via Tauri updater; signed installers
- [ ] Native notifications for chat when in another app

## Operations

- [ ] CI: GitHub Actions — typecheck, tests, web build, Docker build on tag
- [ ] Prometheus `/metrics` (rooms, peers, bitrates, worker CPU) + Grafana board
- [ ] Structured logging (pino) with levels + request IDs
- [ ] Load harness: headless bot participants publishing fake media
- [ ] Backup/restore notes for long-lived rooms (currently ephemeral by design)

## Client polish

- [ ] Keyboard accessibility pass: focus trap in panels, shortcuts
      (m to mute, etc.), ARIA live regions for chat
- [ ] Mobile/responsive layout + PWA manifest (installable, wakelock)
- [ ] OpenGraph preview image on invite links (server-rendered meta)
- [ ] More languages; RTL support; i18n for server-generated strings
- [ ] Sound: join/leave chimes, mute-state audio cues
- [ ] Connection-quality indicator per tile (from consumer score)
