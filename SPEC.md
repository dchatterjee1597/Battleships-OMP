# Battleships OMP v1.1 specification

Private, device-approved Battleships for one community. One SQLite-backed Durable Object owns identities, presence, challenges, up to four simultaneous matches and explicit spectator selections. React/TypeScript/Vite UI; Worker assets and same-origin HTTP/WebSockets. No external auth or database.

Brand: **BATTLESHIPS**. Browser title: **Battleships OMP v1.1**. Retain service `battleships-omp-v1`, class `BattleshipsRoom`, binding `ROOM`, migration tag `v1`, and named community `private-community-v1`.

## Access and admission

Reusable invitation and one-time admin approval remain browser-bound. Keep hashed credentials, existing HttpOnly/SameSite cookies, username validation and uniqueness, same-origin checks and rate limits. Approved users play independently of admin presence. No application ceiling on stored approved identities; at most 256 pending requests.

At most 25 distinct approved identities are admitted: connected lobby users, captains, spectators, and disconnected captains with unexpired reconnect reservations. Admin sessions and pending requests do not count. Same-device takeover and reserved return use the existing place. Excess users retain approval and see a full-community screen checking availability every ten seconds; the server enforces capacity on admission.

## Lobby and independent matches

Presence identifies readiness, deployment, battle, reconnecting, result review, or spectating a named pairing. At most four matches in placement/playing, including paused matches; finished results immediately free match capacity. No player participates in two matches. Acceptance rechecks both connected/ready/unassigned captains and capacity, then cancels only challenges involving that pair. Unrelated challenges persist for their normal 60-second lifetime.

A lobby user may watch a selected live or deploying match. Spectating cancels their challenges and makes them unavailable for new ones. Return to lobby before changing matches or challenging; previous readiness is restored. Spectator disconnect returns them to the lobby. Spectators cannot issue gameplay commands. One device has one controlling socket; old sockets cannot mutate or disconnect its replacement.

Results last up to 15 seconds. A participant may clear their finished match sooner; spectators may leave independently. Cleanup returns only that match's participants and remaining spectators, preserving unrelated matches/readiness. Captains become ready again; spectators retain their readiness preference.

## Reconnection

A controlling captain's detected disconnect persists a 90-second deadline and reserves their community place. Placement and combat pause while either captain is absent. Timely return with the same approved identity preserves fleet locks, turn, revision, shots and salvo state. Unlocked placement drafts remain in that tab's session storage.

At the first expired deadline: cancel placement; in combat, award the connected opponent a forfeit, or abandon without a winner when both are absent. Deadline expiry is authoritative even if the alarm has not fired yet. Explicit forfeit and revocation remain immediate. Hidden-page events alone do not disconnect. Foreground health checks replace stale sockets. Grace begins at server detection, not necessarily at the instant of physical network loss.

## Rules and secrecy

Preserve 10x10 boards, the five standard ships (5/4/3/3/2), legal touching, manual/random placement, locked fleets, random first turn, one-shot normal turns, and three-shot salvos. Salvo first unlocks on own third firing turn, recharges with two normal turns, never stacks, and resolves all three validated shots even on the winning turn.

Match ID and membership scope every gameplay action; revision prevents stale firing. Public snapshots whitelist fields. Only an owner receives their fleet, even after completion. Confirmed sunk geometry is derived only from fully hit ships; partial-hit ship identities remain hidden. Lobby summaries expose no boards or logs. Detailed state goes only to the selected match's participants/spectators; unrelated shots do not trigger match updates elsewhere. Admin APIs expose identity metadata only.

## Persistence and interface

Persist schema version 2 with match records, user spectator selection/notices, and per-match reconnect deadlines in the existing room JSON row. Upgrade v1 state once, preserving all identities and any match, retaining the original JSON in room row 2 as a recovery backup. Reject unknown schema versions. Do not rename/delete the DO or create a new namespace. SQL state commits precede broadcast. Socket attachments restore control after hibernation; missing connections enter normal reconnect handling. One alarm covers all challenge expiries, reconnect deadlines and result cleanup; processing is idempotent.

Extend session responses with admission capacity. Add spectate and leaveSpectating actions, activity/match ID in public presence, community match summaries, server time and reconnect deadlines. Snapshot.match is only the recipient's selected match or null.

## Presentation and acceptance

Preserve the premium tabletop artwork, palette and brand. Compact lobby heading without the map illustration; show players, ongoing matches and rules. Admin requests/denied/revoked stack independently beside approvals. Desktop match header scrolls away; full-size boards stay stacked; viewport-bounded sticky sidebars keep primary controls accessible with bounded log/roster scroll. Preserve phone placement/combat and fixed firing controls.

Validate rules and privacy regressions, concurrent-match/race isolation, four/25 limits, unlimited approved records, spectator transitions, deadlines/recovery/abandonment, takeover, revocation, storage conversion and real restarts. Run typecheck, formatting, unit tests, real-Worker browser matrix, persistence/runtime suites, build and deployment dry-run. Physical iPhone app switching and human visual review remain final sanity checks. Deployment requires separate authorization.
