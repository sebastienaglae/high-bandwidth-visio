# Contributing

Thanks for your interest in improving visio!

## Getting started

```bash
npm install
npm test          # unit tests (vitest)
npm run typecheck # strict TypeScript across workspaces
npm run dev:server
npm run dev:web
```

## Ground rules

- `npm test` and `npm run typecheck` must pass before every commit.
- No new runtime dependencies without discussion — the client is deliberately
  framework-free.
- Keep the UI text in `web/src/i18n.ts`: every user-facing string must exist
  in **all three** languages (en, fr, ja). The i18n tests enforce this.
- Server inputs are hostile by default: validate sizes, formats and counts.
- Match the existing warm editorial style; no emojis in the interface.

## Commit style

Short imperative subject lines, e.g. `feat(server): cap data producers per peer`.
