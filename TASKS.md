# v1.1 implementation tracker

- [x] Preserve community/Worker/DO identity and browser approvals.
- [x] Extend authoritative state to independently addressed matches and explicit spectators.
- [x] Enforce four ongoing matches and 25 admitted identities including reconnect reservations.
- [x] Remove the approved-identity ceiling while retaining bounded pending requests and rate limits.
- [x] Add persisted 90-second reconnect windows during setup/combat, pause/resume, abandonment and scoped cleanup.
- [x] Extend public presence, selected-match snapshots, admission responses and isolated broadcasts.
- [x] Add idempotent legacy state conversion with a retained recovery copy.
- [x] Compact lobby/admin and bound desktop sidebars; preserve mobile game layouts.
- [x] Update title/version labels and governing specification.
- [x] Add rule/isolation/capacity/reconnect/storage tests and actual-runtime coverage.
- [x] Complete final browser matrix, visual checks, persistence/runtime checks and deployment dry-run.
- [ ] Human physical-iPhone and visual sanity checks.
- [ ] Separately authorized deployment (not part of this build).

Historical v1 work and design artifacts remain in Git history and design-review. Existing unrelated local files are not part of this change.
