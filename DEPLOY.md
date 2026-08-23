# Deploying visio to a VPS

Target: a single high-bandwidth VPS (10 Gbps recommended) running Docker.

## 1. DNS

Create an `A` record pointing your domain at the VPS IPv4, e.g.:

```
visio.example.com.  A  203.0.113.10
```

## 2. Firewall

```bash
ufw allow 80/tcp     # HTTP (Let's Encrypt challenge + redirect)
ufw allow 443/tcp    # HTTPS
ufw allow 40000:40100/udp   # WebRTC media
```

Never expose port 9090 publicly; it is only reachable inside the compose network.

## 3. Configure & launch

```bash
git clone <repo> && cd visio
cp .env.example .env
# edit .env:
#   ANNOUNCED_IP=<vps public ipv4>
#   SITE_ADDRESS=visio.example.com
docker compose up -d --build
```

Caddy obtains and renews TLS certificates automatically.

## 4. Verify

- `curl https://<domain>/api/new-room` → returns a room token
- Open `https://<domain>` in a browser → create room → join from another device via link
- In-call: **Net** panel → Trace route should show the path through the VPS

## Notes

- The SFU adds no transcoding latency - it forwards RTP as-is.
- One mediasoup worker is created per room, round-robin across CPU cores.
- Camera/mic require HTTPS (or localhost). That is why the domain + TLS matter.
- Rooms are ephemeral: the last participant leaving closes the room.
- Room links carry ~128 bits of entropy and are the sole access control.

## Production safeguards built in

- Boot fails fast if `ANNOUNCED_IP` is missing in production mode.
- Per-connection signaling rate limit (60 msg/s) and per-IP HTTP limits.
- Capacity caps: rooms, peers per room, transports/producers per peer.
- Speed test throttled to once / 30 s per IP, response capped at 256 MB.
- Graceful shutdown on SIGTERM/SIGINT (drains WebSocket clients).
- Security headers (nosniff, HSTS, frame-deny in production).

## Updating

```bash
git pull
docker compose up -d --build
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Connects but no video | `ANNOUNCED_IP` wrong/unreachable - must be the public VPS IP; check UDP range open |
| Works with HTTP but no camera | Browsers block getUserMedia outside HTTPS/localhost |
| `docker compose logs visio-server` shows worker died | Check RAM (worker needs ~50 MB) and that image built fully |
| Traceroute empty in Net panel | Container lacks `traceroute`; verify it is installed in server/Dockerfile |
