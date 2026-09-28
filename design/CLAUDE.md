# Bass Trainer

Static web app for practising the bass parts of real songs: chunked looping, tempo control, a silent visual metronome, per-note finger recommendations, and a scrolling notation and tab strip synced to YouTube, Spotify, a synth or a spoken count.

Read before starting any task:

- `docs/system-description.md`: screens, behaviour, data model, algorithms, milestones.
- `docs/adr/`: architecture decisions. Follow them; if a change conflicts with an ADR, propose a new ADR instead of silently deviating.
- `design/README.md` and `design/artboards/*.dc.html`: visual and behavioural reference. Match sizes, colours and timing from these files.

## Stack

Vite, React, TypeScript (strict), Tailwind CSS with the tokens in `design/tokens/tokens.css`, Zustand for session state, Vitest, Playwright. Node script for song preprocessing using alphaTab's importer. See ADR-0002 and ADR-0004.

## Repository layout (target)

```
songs/<slug>/score.gp        Guitar Pro source (do not modify)
songs/<slug>/song.json       Sidecar: media ids, sync anchors, overrides
schemas/song.schema.json     Sidecar schema
scripts/build-songs.ts       .gp + sidecar -> public/data/*.json
public/data/                 Generated, not committed
public/audio/count/          Count samples (WAV)
src/                         Application
design/                      Design reference (read only)
reference/                   Parser prototype and test fixtures
docs/                        System description and ADRs
```

## Commands (to be created in milestone 1)

- `npm run dev`, `npm run build:songs`, `npm run build`, `npm run preview`
- `npm test` (Vitest), `npm run test:e2e` (Playwright)

## Rules

- No backend, no runtime secrets. Everything is static files.
- Do not deploy anywhere until ADR-0001 (hosting and access control) is decided. The song files must not end up on a public URL.
- Never store lyrics text or downloaded audio/video in the repository (ADR-0011).
- Playback position is not React state. Per-frame updates go through the clock subscription and `requestAnimationFrame` (ADR-0002, ADR-0008).
- String colours come only from the `--string-1..4` variables (ADR-0009). The green accent is for play, loop and current-chunk markers only.
- The UI targets 1440 × 900 in full-screen mode and must work from 1280 px wide. No page scrolling.
- Algorithms (chunking, fingering, sync interpolation) are pure functions in `src/core/` with unit tests. `reference/vortex-surfer-chunks.json` is the acceptance fixture.
- Keep ADRs current: add a new numbered ADR for each significant decision.
