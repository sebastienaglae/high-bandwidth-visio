# Production readiness

Visio is code-ready when CI, the production compose smoke, browser QA, and the
native release build pass. A particular deployment is ready only after the
environment gates below are satisfied on the target network.

## Automated release gates

- `npm ci` and `npm audit --omit=dev`
- `npm run typecheck` and `npm test`
- `npm run build -w web` and `npm run build -w server`
- `npm run qa:ui:cross-browser`
- `docker compose --profile turn up -d --build --wait` followed by `REQUIRE_TURN=1 npm run smoke:production` and `npm run smoke:turn`
- Trivy rejects high or critical vulnerabilities with available fixes in both production images.
- `npm run build:desktop` for signed desktop release candidates

## Deployment-specific launch gates

- DNS resolves to the intended server and Caddy has obtained a valid TLS certificate.
- `ANNOUNCED_IP` is the public address reachable on the configured UDP media range.
- TURN is configured with a generated credential and `REQUIRE_TURN=1 npm run smoke:production` passes.
- A two-device call succeeds across two independent networks, including audio, video, screen share, reconnect, and leave/rejoin.
- Capacity is validated on the intended VPS. Start with a staged call test at the expected concurrent peer count and watch `/metrics`, CPU, memory, packet loss, and egress.
- Grafana and Prometheus remain bound to localhost or a private admin network. Change the Grafana password before enabling the profile.
- Firewall exposure is limited to 80/tcp, 443/tcp, the configured RTC UDP range, and TURN 3478/tcp+udp plus 49152-49251/udp when enabled. Port 9090 is private.
- Release artifacts are signed/notarized where the target platform requires it.

## Rollout and rollback

1. Build immutable images from a tagged commit and retain the previous image tags.
2. Run the production smoke against staging, then deploy during a monitored window.
3. Run the external two-network call test immediately after deployment.
4. Roll back to the retained images if health, signaling, or media checks fail.

Rooms and chat/file data are ephemeral, so there is no application database to
migrate or restore. Preserve only operational configuration, TLS state, and
observability data according to the operator's retention policy.
