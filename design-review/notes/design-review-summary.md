# Battleships frontend design study

This records the original visual study before the final rebrand. Original PNGs and exact generation records retain their historical labels. The implemented BATTLESHIPS frontend and actual app screenshots are documented in [the final tabletop review](../final-tabletop-implementation/index.md).

Completed 3 October 2026 (Asia/Calcutta). Six browser screenshots and twelve generated redesign PNGs are saved locally. [Compare the images in the offline gallery](index.html) or use the [Markdown index](index.md).

## Scope

The existing React frontend, Worker, SQLite Durable Object, authentication, approvals, challenges, privacy rules, game rules, salvo timing, test credentials and deployment configuration were left unchanged. Nothing was deployed. The normal documented `npm run dev` app was launched on port 8787. Captures used the same real application through the existing `tests/wrangler.jsonc` configuration on port 8788, with a new isolated storage directory for each run. Production/local review credentials were not used in the study or copied into any artifact.

## What was captured

- **Admin console:** two pending requests (Nikhil and Sana), four connected approved devices (Maya, Arjun, Shore and Leena), an empty denied section and one revoked device. These states came from real join and admin UI actions. Pending users are correctly shown offline because unapproved devices do not have game sockets.
- **Ready lobby:** four approved users online. Maya, Arjun and Shore are ready; Leena is taking a shore break. Enabled and disabled Challenge actions are visible. Desktop includes the existing fieldcraft briefing; mobile hides it according to the app's own responsive rules. Capture occurs before sending the challenge, so no expiring challenge card needs to be frozen.
- **Ongoing match:** Maya's active player perspective against Arjun after twelve confirmed shots, including hits, misses, a sunk Destroyer, and an earlier three-shot salvo followed by the required two normal recharge turns. C1, D1 and E1 are selected for a second, available salvo. Both boards, fire controls, signal log, crew and two spectators (Shore and Leena) are visible. The selected salvo is not fired.

The helper places the fleet through the existing UI at fixed cells: carrier A1–E1, battleship C3–F3, cruiser G5–I5, submarine B7–D7 and destroyer F9–G9. Both players use that arrangement only to make the visual state reproducible. No server state injection, mocked responses, changed timing or hidden enemy positions are used. Actual spectator WebSocket snapshots were checked to exclude fleets; the player's snapshot contains only their own fleet. No browser page errors or horizontal overflow occurred.

## Viewports and baseline dimensions

Chromium, device scale factor 1, reduced motion, `en-GB` locale and Asia/Calcutta timezone. Desktop viewport: **1440 × 1000**. Narrow mobile viewport: **390 × 844**. All six are full-page captures, so image heights exceed viewport heights.

| Baseline file     | PNG dimensions |
| ----------------- | -------------- |
| desktop-admin.png | 1440 × 1236    |
| desktop-lobby.png | 1440 × 1079    |
| desktop-match.png | 1440 × 1733    |
| mobile-admin.png  | 390 × 1752     |
| mobile-lobby.png  | 390 × 1161     |
| mobile-match.png  | 390 × 2266     |

The mobile match's existing crew disclosure is opened for inspection. Screenshot-only CSS places the existing fixed firing dock in the blank space at the bottom of the full-page image, preventing it from obscuring grid rows. This is a capture accommodation, not a proposed change to the app's dock behavior. The script resizes the same connected page rather than reloading an active player, which would forfeit under the actual rules. Mobile captures exercise responsive layout; they are not a physical-device or touch interaction test. Device identifiers, timestamps and the randomly chosen first player may differ between reruns; fleet placement and shot sequence are deterministic relative to that player.

## Saved image sets

Each directory contains exactly these six filenames: `desktop-admin.png`, `desktop-lobby.png`, `desktop-match.png`, `mobile-admin.png`, `mobile-lobby.png`, `mobile-match.png`.

- `design-review/baseline-screenshots/` — actual browser screenshots.
- `design-review/cold-war-ops-room/` — Theme A, six generated concepts.
- `design-review/premium-tabletop-strategy/` — Theme B, six generated concepts.

The [image catalog](image-catalog.json) records all eighteen dimensions, file sizes and SHA-256 hashes. PNG structure and compressed image data were checked. The offline gallery loads only relative local files and has no external fonts, images or dependencies.

## Generation and comparison

Used Codex's built-in `image_gen.imagegen` route. The user explicitly accepted GPT Image 2 / ChatGPT Images 2 instead of requiring an Images 2.5 label. The tool does not expose a model selector or return a precise model identifier. No API key, CLI fallback, third-party assets or remote hotlinks were used.

Each concept uses its matching baseline PNG as structural reference. Each theme's generated desktop admin image is also supplied as a style-only anchor for its other five screens. Full prompts, image roles and destinations are in [generation-prompts.md](generation-prompts.md) and [generation-jobs.json](generation-jobs.json). Outputs were copied into the repository without resampling. Cold War mobile match received a composition refinement and then a targeted row-number correction; the final correction prompt is recorded in [generation-revisions.json](generation-revisions.json).

| Dimension    | Cold War Ops Room                                                             | Premium Tabletop Strategy Game                                            |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Character    | Naval command and plotting console                                            | Private club and crafted strategy board                                   |
| Palette      | Navy/charcoal, olive outlines, green readiness, amber actions, restrained red | Parchment/linen, enamel blue, brass, sage readiness, terracotta danger    |
| Typography   | Industrial headings and tactical monospace labels                             | Editorial serif headings and refined text with monospaced metadata        |
| Surfaces     | Fine plotting grids, clipped card corners, dark instrument panels             | Paper texture, soft shadows, brass trim, raised enamel ship pieces        |
| Strength     | Clear operational states and dramatic engagement view                         | Welcoming game-night atmosphere and tactile fleet presentation            |
| Review focus | Restraint of background grid/radar decoration and smaller dark-surface text   | Restraint of map/compass decoration, serif body density and panel shadows |

Both sets preserve the recognizable header, screen purposes, approval categories, lobby readiness controls, desktop sidebars, mobile section sequence, two stacked ten-by-ten boards, hidden enemy fleet and active firing controls.

## Limitations

These are raster design concepts, not implemented or interactive themes. Generated text, device identifiers, grid geometry and spacing can vary slightly from the baseline and should not be treated as specifications or a replacement for the actual app. The especially tall mobile admin/match references were condensed into approximately 1:3 portrait outputs; their full-page proportions and board cell shapes are therefore not pixel-exact. All main sections remain present. The Cold War mobile grid's duplicated row label was corrected during visual QA. The tabletop desktop admin takes the material theme further with decorative compass/book cues at the canvas edges; those are visual exploration, not new product widgets. Final implementation would require separate typography, contrast, touch-target and responsive validation.

## Rerun

Run these commands from the repository root in PowerShell. Dependencies and Chromium are already installed in this workspace; if recreating the checkout, first use the documented `npm ci` and `npx playwright install chromium`.

```powershell
# Normal documented local review app (optional for the isolated captures):
npm run dev

# In a separate terminal, build once before the capture server starts:
npm run build
node scripts/design-review/capture-ui-screenshots.mjs
node scripts/design-review/prepare-generation.mjs
```

The capture helper starts and stops its own real test Worker on 8788 and uses inspector port 9230. Port 8788 must be free. Do not build during capture: frontend rebuilds can drop active game sockets. The helper deliberately refuses to reset or reuse another running test server. It writes ignored runtime storage/registry/logs under `design-review/.runtime/`. On this restricted Windows agent host, a sandboxed run could capture successfully but could not terminate its child process tree; the successful final run used approved local process permissions. An ordinary local PowerShell run should use the current user's normal process permissions.

**Image generation is an agent tool workflow, not a shell command.** To regenerate, ask Codex: “Regenerate the twelve design-review concepts using design-review/notes/generation-jobs.json and the built-in imagegen tool; use the listed baseline/style references, create desktop-admin first for each theme, inspect the results and save them to the listed destinations. Apply generation-revisions.json only if the listed defect is present.” This invokes the existing built-in tool without inventing an API bridge or requiring a key. Model outputs are not byte-deterministic.

After generation, validate the files and rebuild the offline gallery:

```powershell
node scripts/design-review/build-gallery.mjs
Start-Process -FilePath .\design-review\notes\index.html
```

Helpers added: `capture-ui-screenshots.mjs` (real UI/state capture), `prepare-generation.mjs` (prompt manifest only) and `build-gallery.mjs` (PNG validation and offline indexes), all under `scripts/design-review/`. No application refactor or visual theme has been applied.

Optional browser verification: `node scripts/design-review/build-gallery.mjs --verify-browser`. This was run successfully: all six selectors worked, all eighteen local images decoded in Chromium, and no gallery page errors occurred. Temporary capture storage was removed after completion; subsequent runs create fresh ignored storage.
