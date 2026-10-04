# BATTLESHIPS · Final tabletop frontend review

The actual React frontend translates all six Premium Tabletop Strategy Game references into a shared parchment/linen, naval blue and antique brass system. System Palatino/Georgia display typography, ivory framed grids, enamel ship SVGs and tactile counters are original/local. Desktop retains the roster at left, vertical enemy/own boards in the center and controls at right. Mobile retains the ship tray, touch placement, explicit Rotate, compact roster disclosure and fixed firing bar.

Visible brand: **BATTLESHIPS**. Exact page title: **Battleships OMP v1**. Future Worker/service name: `battleships-omp-v1`. No deployment, remote push or commit has been performed. Server/shared implementation, authentication, game rules, DO class `BattleshipsRoom`, migration `v1`, room identity, schema and protocol are unchanged. Internal cookies retain their existing names to preserve remembered approvals. The original study images and exact recorded prompts remain pre-rebrand historical references.

## Screens and state

The eight required PNGs are full-page captures from the actual local Worker, with desktop viewport 1440×1000 and mobile viewport 390×844. Access control has two pending requests, four approved devices and a revoked device; the ready room contains four players, one unavailable. Deployment shows all five vessels in a valid formation. The match shows twelve public shots, mixed hits/misses, a sunk destroyer, an active player's private fleet, two spectators, salvo availability and three selected targets.

Additional `qa/` captures show landing, waiting for approval, admin login, incoming challenge, spectator boards, victory and defeat. `qa/mobile-match-viewport.png` shows the normal fixed action bar. Full-page mobile match/result screenshots relocate the same action bar into blank footer space only while capturing, to avoid covering grid rows in a long scroll image. Gameplay uses its normal fixed position.

The capture helper checks page titles and absence of old branding, zero page errors, no page overflow, the normal mobile firing-bar position, and private-fleet redaction in real WebSocket snapshots. It also checks match widths 320, 360, 768 and 1024 pixels. Date/device IDs and random starting captain vary on reruns; fleet geometry and shot sequence are fixed.

## Rerun

From the repository root, with port 8788 free:

```sh
npm run build
node scripts/design-review/capture-ui-screenshots.mjs --final
node scripts/design-review/build-gallery.mjs --final --verify-browser
```

Capture starts and stops its own isolated test Worker with unchanged local-only credentials from `tests/wrangler.jsonc`. Runtime storage/logs are ignored under `design-review/.runtime/`; normal `.wrangler/state` is not reset. Do not rebuild assets while a browser match is running.

For human interaction, run `npm run dev` and visit `http://localhost:8787`; use the existing ignored `.dev.vars` invitation/admin values. Use separate browser profiles for separate players. No new secrets or dependencies are needed.

## Visual adaptations and limits

Validation passed on 2026-10-03: `npm run typecheck`, `npm run test` (22 tests), `npm run build`, `npm run format:check`, and all eight Playwright scenarios (desktop Chromium, phone Chromium, desktop Firefox, phone WebKit). The suite preceded the final button contrast/wrapping and finished-state copy polish; the refreshed real-runtime capture flow checks the final presentation. The eight required desktop/mobile screens were visually inspected.

The implementation uses the reference materials, borders, type hierarchy and ship-piece treatment while preserving actual square 10×10 grids and all original controls. Generated decorations and condensed mobile proportions were adapted to the working app. Hover, hit/sink feedback and target animation respect reduced motion. Text/body, coordinate, turn-state and primary-action contrast were checked; brass actions have approximately 4.94:1 white-text contrast.

Persistence/backend restart tests were not repeated because backend behavior and storage are unchanged. Production and physical phone hardware remain human validation steps. The next step is visual review, any small correction, a human Git commit and then deployment to the intentionally renamed Worker.
