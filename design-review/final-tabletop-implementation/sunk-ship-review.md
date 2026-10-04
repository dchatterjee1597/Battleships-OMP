# Public sunk-ship polish

Completed 3 October 2026 (Asia/Calcutta). Real local-app captures:

| View          | Desktop                                              | Mobile                                              |
| ------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Active player | [Match with sunk ships](desktop-match-sunk-ship.png) | [Match with sunk ships](mobile-match-sunk-ship.png) |
| Spectator     | [Public boards](desktop-spectator-sunk-ship.png)     | [Public boards](mobile-spectator-sunk-ship.png)     |

The screenshots show a vertical destroyer at F9–F10 and a horizontal cruiser at G5–I5, both fully sunk. The carrier has only two hits and remains hidden. Original ship models use a reusable `sunk-public` variant with clipped scorch patches, fracture lines and two restrained orange/red flame details. Red X counters stay above the models, positioned at the upper corner of revealed sunk cells to leave damaged decks visible; the darker killing-blow counter is retained. Own private-fleet models and unsunk public ships are unchanged.

With explicit user approval, snapshot serialization adds `sunkCells` only to confirmed sink results and only when every occupied cell already has a public hit. It is derived when reading the snapshot, never stored in match state. Game rules, sink detection, auth, challenge/salvo logic, storage/schema, branding and Worker configuration are unchanged. The client validates exact straight geometry and confirmed hits before rendering, and never guesses positions from adjacent hits. Both enemy and spectator boards reuse this rendering.

Validation: typecheck, 37 unit tests, production build and the isolated real-Worker browser capture flow pass. Tests cover all five vessel classes horizontally/vertically, touching ships, partial hits, malformed metadata, private owner rendering and public redaction. Desktop 1440×1000 and mobile 390×844 were visually inspected, with no horizontal overflow or page errors. Full-page mobile captures relocate the existing fixed firing bar into footer space only while capturing, as in the original helper.

To rerun with port 8788 free:

```sh
npm run build
node scripts/design-review/capture-ui-screenshots.mjs --sunk
```

The `--sunk` mode uses fresh isolated state and unchanged local-only test credentials, saves only these four images and `sunk-ship-capture-metadata.json`, and preserves the previous review screenshots. Runtime files remain ignored under `design-review/.runtime/`.

To review interactively: `npm run dev`, then `http://localhost:8787`, using the existing `.dev.vars` invitation/admin values. No deployment, push or commit was performed.
