# Compliance baseline

Visio is engineered toward WCAG 2.2 AA and privacy-by-design deployment. Legal
compliance ultimately depends on how an operator deploys and runs the service,
so this document separates application guarantees from operator obligations.

## Accessibility

- Every visible control has an accessible name and a visible keyboard focus.
- Custom selects expose combobox/listbox/option semantics and support pointer,
  Escape, Enter, Space, arrows, Home/End, type-ahead, and outside-click dismissal.
- Toggle controls expose `aria-pressed` or checkbox state without relying on
  color alone.
- Dialogs trap focus, close with Escape, and return focus to their trigger.
- Status, chat, errors, reconnection, and microphone level use appropriate live
  regions or value semantics.
- Motion is suppressed when `prefers-reduced-motion` is enabled, and Windows
  forced-colors mode receives explicit borders and selected-state outlines.
- Primary surfaces are checked in Chromium with axe rules tagged through WCAG
  2.2 AA; interaction and visual checks also run in Firefox and WebKit.

Automated checks cannot certify accessibility by themselves. Before a public
launch, the operator should complete the keyboard, screen-reader, zoom, and
mobile checks in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Privacy and data protection

The application ships without advertising, analytics, tracking pixels, or
third-party fonts. Meeting media is forwarded by the configured SFU and is not
transcoded. Chat and file transfers are ephemeral; the server does not persist
their content. Browser storage contains local preferences such as language,
theme, display name, devices, quality mode, and onboarding completion.

An operator remains responsible for its privacy notice, lawful basis, data
processing agreements, regional hosting choices, log and metrics retention,
incident response, data-subject request process, and any recording consent
required in the jurisdictions where the service is offered. Local recording is
explicitly initiated by a participant and must be covered by operator policy.

## Security and operations

Production configuration, secret handling, transport security, TURN, image
scanning, monitoring, backups, release signing, and external validation gates
are documented in [DEPLOY.md](../DEPLOY.md), [SECURITY.md](../SECURITY.md), and
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
