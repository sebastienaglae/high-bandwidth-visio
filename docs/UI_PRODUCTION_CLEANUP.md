# Production UI cleanup

## Goal

Bring the web and Tauri client to a restrained, professional production standard without introducing Bootstrap or a generic component library. Preserve Visio's warm editorial identity while making the meeting experience feel precise, trustworthy, accessible, and ready for daily use.

## Current UI architecture

- `web/src/main.ts` builds the landing, pre-join, room, chat, and whiteboard DOM imperatively.
- `web/src/style.css` contains the complete visual system and all responsive behavior.
- `web/src/netpanel.ts` owns network diagnostics rendering.
- `web/src/icons.ts` provides the icon set.
- `web/src/i18n.ts` contains user-facing copy in English, French, and Japanese.
- `web/src/layout.ts` owns grid/speaker layout selection.
- `web/tests/` has behavioral tests, but no visual regression or accessibility coverage.
- `docs/screenshots/` and `scripts/screenshots.mjs` provide the existing visual baseline.

## Product design direction

- Use a quiet, neutral meeting canvas. Reserve terracotta for brand moments and selected/primary states, not routine status or large UI areas.
- Keep the serif wordmark on marketing surfaces only. Use the sans-serif stack for operational UI, headings, panels, and controls.
- Prefer structured, edge-aligned surfaces over disconnected floating cards.
- Use familiar meeting-control conventions: clear grouping, labels/tooltips, explicit selected states, and a visually isolated destructive leave action.
- Avoid decorative gradients, oversized radii, glass effects, emoji controls, novelty illustrations, and excessive animation.
- Target WCAG 2.2 AA, keyboard operation, reduced motion, and touch targets of at least 44 by 44 CSS pixels.

## Implementation backlog

### P0 — establish a production foundation

- [ ] Refactor the tokens at the top of `web/src/style.css` into semantic groups: canvas/surface/elevated, text, border, brand, success/warning/danger, focus ring, shadow, spacing, radius, and motion. Add explicit status colors instead of reusing the accent or danger token.
- [ ] Replace one-off values with a compact spacing scale and three radius levels. Reduce pill shapes to tags, status badges, and segmented controls.
- [ ] Add complete interaction states for every button, input, select, link, swatch, and tile action: hover, active, focus-visible, disabled, selected, and destructive.
- [ ] Add a high-contrast `:focus-visible` ring that is not communicated by color alone. Never remove the native outline without an equivalent replacement.
- [ ] Add `prefers-reduced-motion` handling and limit theme/layout transitions to properties that do not cause distraction or layout work.
- [ ] Normalize typography to a clear scale for page title, section title, body, label, helper, and telemetry. Ensure Japanese fallback fonts are intentional.
- [ ] Add a narrow-screen breakpoint and safe-area support. The current 380 px grid minimum and fixed 330 px panels do not fit common phones.

Acceptance criteria:

- All interactive elements have a visible keyboard focus state in light and dark themes.
- Body text and controls meet 4.5:1 contrast; large text and meaningful UI graphics meet 3:1.
- No horizontal page overflow at 320, 375, 768, 1024, and 1440 px widths.
- The UI remains usable at 200% browser zoom.

### P0 — rebuild the in-call shell

- [ ] Turn `.room` into a three-region application shell: compact top status bar, fluid media stage, and stable bottom control dock.
- [ ] Add a top bar with room identity, connection state, elapsed meeting time, participant count, and a single overflow menu for secondary actions.
- [ ] Reorganize controls into media, collaboration, and session groups. Keep microphone, camera, share, and leave always visible; move theme, diagnostics, layout, recording, and lower-frequency actions into labeled menus where space is constrained.
- [ ] Add accessible tooltips and `aria-label`/`aria-pressed` to icon-only controls. Show short text labels on desktop where ambiguity is costly.
- [ ] Replace the nearly invisible idle state (`opacity: 0.12`) with an intentional auto-hide treatment that restores immediately on focus, pointer movement, or touch.
- [ ] Give Leave a persistent destructive treatment and separation from utility actions.
- [ ] Convert quality mode selection into a labeled popover or settings control with a short explanation of bandwidth/latency impact; do not devote the primary toolbar to five unexplained words.
- [ ] Define empty, connecting, camera-off, screen-share, active-speaker, pinned, poor-connection, and local-preview tile states.
- [ ] Add a professional camera-off tile with initials and a neutral background. Do not use playful avatars or random saturated colors.
- [ ] Make tile overlays readable over any video using a controlled dark scrim; avoid theme-colored translucent labels on video.

Acceptance criteria:

- A first-time user can identify mute, camera, share, participants/chat, and leave without trial and error.
- The control dock works without clipping at 320 px and with long French/Japanese labels.
- Speaker and grid layouts use the available viewport without producing cropped controls or off-screen tiles.
- All room actions are reachable by keyboard and expose their state to assistive technology.

### P1 — make panels feel native to the application

- [ ] Replace the left/right floating panel mismatch with a shared panel component style: consistent header, close action, padding, divider, scroll region, and footer.
- [ ] On desktop, dock chat/diagnostics beside the stage and resize the stage. On tablet/mobile, use a full-height sheet with a scrim and focus trap.
- [ ] Add an explicit empty state to chat and separate sender, timestamp, content, and transfer status rather than placing all content in one tinted bubble.
- [ ] Improve the composer with a multiline input, send button hierarchy, attachment affordance, drag state, upload progress, error state, and disabled/offline state.
- [ ] Present network data as labeled metrics with units and status severity. Keep monospace for values only; provide a plain-language connection summary before traceroute detail.
- [ ] Restyle the whiteboard toolbar as a compact rectangular tool rail with labeled groups and visible selected states. Ensure every color has a non-color selected indicator and accessible name.

Acceptance criteria:

- Opening a panel never obscures critical controls or makes the media stage unusable.
- Focus enters modal sheets, remains trapped, returns to the trigger on close, and Escape closes the topmost dismissible surface.
- Empty/loading/error/success states exist for chat transfers, diagnostics, and whiteboard synchronization.

### P1 — refine landing and pre-join

- [ ] Give the landing page a real hierarchy: concise product promise, primary Create flow, quieter Join flow, and trust/privacy copy. Avoid presenting two similar text fields as an undifferentiated form.
- [ ] Use explicit field labels rather than placeholder-only naming. Add inline validation and reserve layout space for errors.
- [ ] Consolidate language and theme into a small utility header that aligns with the page content instead of floating at the viewport edge.
- [ ] Rework pre-join into a responsive two-column desktop layout with preview on the left and setup controls on the right; stack it cleanly on small screens.
- [ ] Add a clear device-permission state, camera-off preview, microphone activity meter, selected-device labels, and a settings disclosure for E2EE/device details.
- [ ] Make Join the single dominant action and show the room identifier/privacy warning as supporting information.

Acceptance criteria:

- Landing and pre-join forms have programmatic labels, inline errors, predictable Enter behavior, and logical tab order.
- Permission denied, no-device, device-busy, and preview-loading states are designed and translated.
- Both screens fit a 667 px-tall mobile viewport without hiding the primary action.

### P1 — accessibility and internationalization pass

- [ ] Add landmarks, headings, form labels, accessible names, pressed/expanded/current states, and live regions to imperative DOM creation in `web/src/main.ts` and `web/src/netpanel.ts`.
- [ ] Announce join/leave, reconnect, mute changes, file-transfer results, and validation errors without announcing rapidly changing telemetry.
- [ ] Add focus management for route changes, error screens, panels, menus, and whiteboard mode.
- [ ] Ensure keyboard shortcuts never fire from editable controls and document them in an accessible shortcuts dialog.
- [ ] Replace title-less icon buttons and symbol-only close buttons with the shared icon button pattern.
- [ ] Audit every string in `web/src/main.ts` and `web/src/netpanel.ts`; move user-facing copy into `web/src/i18n.ts` and test all three locales.
- [ ] Prevent layout assumptions based on English string length and prepare logical CSS properties for future RTL support.

Acceptance criteria:

- Complete landing, pre-join, join, chat, diagnostics, whiteboard, and leave flows with keyboard only.
- Automated accessibility checks report no serious or critical issues on each principal surface.
- English, French, and Japanese screenshots show no clipping or overlap.

### P2 — feedback, resilience, and finish

- [ ] Introduce a restrained toast/status system for copied link, settings saved, recording started/stopped, file events, and recoverable failures.
- [ ] Replace transient button-label mutations with stable controls plus status feedback.
- [ ] Add skeletons or progress states for device initialization, room connection, diagnostics, and media reconnection.
- [ ] Standardize confirmation dialogs for leave, stop recording, remove participant, clear board, and other destructive actions according to recoverability.
- [ ] Add polished scrollbars where supported, empty-state spacing, text truncation rules, loading cursor rules, and offline behavior.
- [ ] Add metadata polish: application icons, favicon, theme color, Open Graph preview, and PWA manifest when the responsive pass is complete.

## Suggested code sequence

1. Extract small DOM factories for button, icon button, field, panel, tooltip, menu, status badge, and toast. Keep the no-framework architecture; a framework migration is not required for visual quality.
2. Introduce semantic tokens and shared component styles without changing layout.
3. Rebuild landing and pre-join, then capture light/dark/mobile baselines.
4. Rebuild the room shell and tile states.
5. Migrate chat, diagnostics, and whiteboard to the shared panel structure.
6. Complete accessibility/i18n and responsive edge cases.
7. Add automated visual, accessibility, and interaction regression coverage.

## Verification plan

- [ ] Extend `scripts/screenshots.mjs` to capture every principal surface at desktop, tablet, and mobile widths in both themes.
- [ ] Add Playwright visual snapshots for landing, pre-join, empty room, populated grid, speaker mode, chat, diagnostics, whiteboard, reconnect, and join failure.
- [ ] Add automated accessibility checks (for example, axe-core with Playwright) for the same surfaces.
- [ ] Add interaction tests for menus, focus return, Escape handling, tooltips, form validation, panel focus traps, and keyboard shortcuts.
- [ ] Run `npm run typecheck`, `npm test`, and the production web build after each vertical slice.
- [ ] Manually verify Chromium, Firefox, and WebKit plus the Tauri desktop shell; test touch and safe areas on iOS/Android shells.

## Definition of done

- The product has one coherent visual language across landing, pre-join, room, panels, and error/loading states.
- The primary meeting actions are obvious, stable, and responsive; secondary complexity is progressively disclosed.
- No surface resembles Bootstrap defaults or relies on decoration to create hierarchy.
- Light and dark themes, three supported languages, keyboard use, screen readers, touch, reduced motion, and 200% zoom are supported.
- Visual and accessibility regressions are covered in CI, and reference screenshots in `docs/screenshots/` represent the final production UI.

## Out of scope

- Replacing the Vite/TypeScript stack or introducing a UI framework solely for this cleanup.
- Changing WebRTC/SFU behavior, room permissions, or network protocols.
- Adding playful avatars, reactions, illustrations, or decorative animation as part of the professional polish pass.
