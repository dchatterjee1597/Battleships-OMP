# v1.1 actual-app review

Captured October 4, 2026 against isolated local Workers using test-only identities and credentials. No production community was contacted. Existing tabletop reference artifacts are retained in their original directories.

Run `node scripts/design-review/capture-ui-screenshots.mjs --v11` after `npm run build` to regenerate the main pages and QA states. Two-battle lobby and scrolled sticky-panel images are copied from the corresponding successful Playwright scenarios; those regenerate through `npm run test:e2e` in `test-results/`.

Reviewed desktop lobby/admin, player combat, reconnect, two-match presence, sticky controls, mobile lobby/placement/combat and the full-community screen. The automated capture checks hidden-fleet redaction, native mobile firing-dock position, overflow at narrow/tablet widths, unchanged fleets/turn after reconnect, and automatic admission when a place opens. See `capture-metadata.json` for the run details.

Full-page mobile match screenshots temporarily place the existing fixed dock at the end of the document to avoid painting it over board cells. `qa/mobile-match-viewport.png` shows its real fixed position without that screenshot-only adjustment. The app CSS is not changed for captures.

These captures supplement the browser/runtime suites; physical iPhone app switching and final human visual review remain manual checks. No deployment was performed.
