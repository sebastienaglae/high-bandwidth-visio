# Security Policy

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/security/advisories) or
contact the maintainers directly instead of filing a public issue for
vulnerabilities.

## Design notes (things that are intentional)

- **Rooms have no passwords.** Access control *is* the room link: it carries
  ~128 bits of entropy. Treat links like secrets — anyone who has one can join.
- **Traceroute / network panel.** The server learns your public IP (as every
  WebRTC server does) and traces the route to it. This is shown to you only;
  other participants do not see your traceroute.
- **Files shared in chat are ephemeral.** They travel over WebRTC data
  channels between participants and are never persisted on the server.

## Operational recommendations

- Always deploy behind TLS (the provided Caddy setup does this automatically).
- Keep `TRUST_PROXY=1` only when running behind the bundled reverse proxy,
  otherwise rate limiting can be bypassed by IP spoofing.
- Set `MAX_ROOMS` / `MAX_PEERS_PER_ROOM` according to your VPS capacity.
