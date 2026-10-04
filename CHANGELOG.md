# Changelog

## 1.1.0 — 2026-10-04

- Support four independent simultaneous matches in the existing community Durable Object, with a shared lobby, explicit spectator selection, match-scoped actions, private snapshots and local cleanup.
- Admit up to 25 identities, including disconnected captains' reservations; retain same-device takeover and remove the stored approved-identity ceiling.
- Pause placement and combat for a persisted 90-second reconnect window. Resume the same match on timely return; cancel expired setup, forfeit to a connected opponent, or abandon without a winner if both captains are absent. Explicit forfeit and revocation remain immediate.
- Convert legacy room state in place, retaining an immutable original JSON backup and preserving approval credentials, Worker identity, bindings and migration tag. Preserve due alarms across constructor wakeup so timeout results reach clients.
- Add live match/presence listings, a compact lobby and independent admin columns, bounded sticky desktop sidebars, reconnect feedback and same-tab placement drafts. Preserve tabletop branding and mobile gameplay layouts; update the browser title to Battleships OMP v1.1.
- Expand engine, real-runtime, restart, browser and visual coverage. Isolate local browser-test storage/output and own runtime teardown directly on Windows. This change is not deployed or committed.

## Premium tabletop frontend / Battleships OMP v1 — 2026-10-03

- Replace the active product identity with BATTLESHIPS and set the exact browser title to Battleships OMP v1; replace relaxed club copy with concise fleet, challenge and battle terminology.
- Apply the Premium Tabletop Strategy Game references across access, admin, ready lobby, deployment, player/spectator combat, controls, feedback and results. Add local linen/chart SVG motifs, serif display type, ivory/navy/brass materials, original enamel ship pieces and distinct combat counters with reduced-motion support.
- Preserve desktop sidebars and vertical boards, mobile touch/Rotate placement and the fixed firing bar. Game rules, authority, approval, wire protocol, privacy, salvo timing and disconnect behavior are unchanged.
- Rename the future Worker to `battleships-omp-v1`; leave `BattleshipsRoom`, migration `v1`, room identity, schema and internal approval cookies unchanged. No deployment, remote push or commit occurs in this pass.
- Extend the real-runtime screenshot helper with `--final` to capture deployment and populated review states under `design-review/final-tabletop-implementation/`; retain original study images and prompts as historical references.
- Pass typecheck, all 22 unit tests, production build, formatting and all eight browser scenarios across Chromium desktop/phone, Firefox desktop and WebKit phone. Refresh actual-app review captures after the final presentation polish; do not repeat backend restart tests for this frontend-only change.

## Finalization — 2026-10-03

- Recheck the existing implementation and deployment configuration without changing application behavior.
- Repair local Git directory ownership and prepare the uncommitted review diff; normalize source line endings through Git attributes.
- Repeat typecheck, 22 unit tests, production build and formatting checks; retain successful browser and persistence validation from October 2.

## 1.0.0 — 2026-10-02

- Create Battleships, a private single-room Battleships game for two captains and spectators.
- Add device approval and administrator approve/deny/revoke controls with persistent cookie-based identity.
- Add authoritative fleet placement, firing, sinking, independent salvo cooldowns, victory and immediate disconnect forfeits.
- Add SQLite persistence, hibernating WebSockets, atomic challenge acceptance, duplicate-tab takeover and automatic result cleanup.
- Add viewer-specific snapshots with hidden fleet redaction, schema validation, origin checks, request limits and rate limits.
- Add original SVG vessels, responsive desktop/mobile views, pointer/touch placement, keyboard alternative, numbered salvo targeting and combat feed.
- Add unit/browser tests, local development setup, Cloudflare deployment configuration and operational documentation.
