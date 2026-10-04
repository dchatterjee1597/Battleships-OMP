# Battleships OMP v1.1 handoff

## Implementation

The existing community now coordinates four concurrent placement/combat matches, with explicit spectator selection and a 25-player admission limit including reconnect reservations. Approved identity storage has no application ceiling; pending requests retain their separate 256-request bound. The browser title is Battleships OMP v1.1; BATTLESHIPS branding and tabletop artwork remain.

Matches are independently addressed and cleaned up. Presence describes lobby readiness, match membership and spectating. A selected snapshot contains only its own match; unrelated shot updates are suppressed. Owner-only fleets and confirmed public sunk geometry remain intact. Explicit forfeit/revocation are immediate; detected disconnections pause setup/combat for 90 seconds. Both absent at expiry means cancellation/abandonment, never an invented winner.

Desktop lobby/admin layouts are compacted. Desktop game sidebars are viewport-bounded and sticky while full-size boards remain stacked. Logs and long spectator lists scroll inside bounded regions; short viewports retain access through sidebar scrolling. Mobile deployment/combat retain the existing controls. Placement drafts survive same-tab reload through session storage.

## Local review and checks

Use the existing ignored `.dev.vars`; do not replace or publish those credentials. Run `npm run dev`, then use separate browser profiles for players. Use `/admin` for approvals.

```sh
npm run check
npm run format:check
npm run deploy:check
```

The browser matrix uses a programmatically owned local Wrangler runtime, fresh isolated storage, and direct teardown on Windows. No production service is contacted. Browser screenshots and traces are under ignored `test-results/`. The additional runtime test seeds a legacy SQL room through a separate local fixture, then runs the real application against it. It checks 300 approvals, admission/takeover, concurrent matches, wire routing, a genuine 90-second alarm, restarts, revocation and the immutable upgrade backup. Never deploy the test configurations or fixture.

For restricted Windows sessions, put Wrangler's local configuration/logs inside the ignored workspace before running checks:

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.wrangler/config'
$env:WRANGLER_LOG_PATH = '.wrangler/logs'
$env:WRANGLER_SEND_METRICS = 'false'
```

Validated on October 4, 2026: TypeScript checks, 48 unit tests, production build and Wrangler packaging dry-run; approval/session/revocation persistence through two actual runtime restarts; and the complete additional runtime suite described above, including its real 90-second alarm and legacy recovery copy.

All 12 browser scenarios passed across Chromium desktop/phone, Firefox desktop and WebKit phone, including two simultaneous matches and reconnect. Firefox needed an unsandboxed local run because Windows blocked its tab subprocess. After overlapping validation caused a local connection reset and timing failures, the affected cases and unit suite passed in isolated runs. Run these suites serially; do not rebuild assets underneath a running browser test.

Actual local-app visual captures are in `design-review/v1.1-implementation/`. They cover admin, lobby, deployment, combat, spectator/result states, two concurrent battles, sticky desktop panels and mobile controls. The capture run also verifies reconnect preserves fleets/turn, the 26th approved identity sees the full-community screen, and releasing one place admits that waiting browser automatically. There were no page errors or horizontal overflow at the checked widths (320, 360, 390, 768, 1024, 1440). Human review and physical iPhone switching remain outstanding.

## Storage and future deployment

The production configuration remains `battleships-omp-v1`, `ROOM`, `BattleshipsRoom`, migration `v1`, and named room `private-community-v1`. The URL, invitation/admin secrets, approval cookie names/hashes and admin session table stay in place. Do not rename the Worker or DO, recreate the namespace, or regenerate secrets for this version bump.

On first v1.1 access, an application-state conversion atomically retains the v1 JSON in room row 2 and writes schema version 2 into row 1. Subsequent starts do not overwrite that backup. Unknown versions are rejected. Existing matches are retained; missing sockets enter reconnect handling. Alarm wakeup does not consume or replace a due alarm before its handler can notify clients.

**Rollback:** reverting the Worker code alone is unsafe after the state upgrade. The retained row 2 is an initial recovery point, not a continually updated backup. Restoring it would discard later approvals/state; never do so automatically. Prefer a forward fix. Any rollback needs a separately reviewed data conversion/export preserving current identities and a stopped community.

No v1.1 deployment is performed by this build. For a later authorized deployment, wait until matches are finished, confirm the intended existing Worker/account, run the checks above and deploy through the existing command. Ask players to refresh existing tabs for the new UI. Verify approvals are remembered, then create two simultaneous matches and test observation/reconnect. Keep the private invitation out of screenshots/logs intended for sharing.

## Manual sanity checks

- Real iPhone/Safari: switch briefly to Camera, return within the grace window, and verify the same match resumes with unchanged fleets and turn. Repeat a disconnect beyond 90 seconds.
- Desktop: open the signal log, scroll between full-size boards, and confirm both sidebars remain usable. Inspect short-window/zoomed layouts and a long spectator list.
- Lobby: observe two concurrent games, switch spectator views through the lobby, and verify the correct pairing/status throughout.
- Admin: inspect a long approval list beside compact request/denied/revoked sections.
- Production, after separately authorized deployment: verify existing browser approvals, match isolation, server-detected reconnect deadlines and result cleanup.

Transport failure detection is not instantaneous. The 90 seconds starts when the server detects the closed connection. No mobile browser emulator can fully establish physical iPhone background suspension behavior.
