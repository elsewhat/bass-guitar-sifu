# ADR-0004: Build-time preprocessing of Guitar Pro files

Status: Accepted, amended by ADR-0014 (generated data committed)
Date: 2026-09-28

## Context

Parsing Guitar Pro and running the chunking and fingering algorithms in the browser on every song load is possible, but adds bundle size and load time, and makes results harder to test.

alphaTab (MPL-2.0) reads Guitar Pro 3–8, alphaTex and MusicXML. Its documentation lists Guitar Pro 8 support with 98 of 102 relevant features (96 %).

## Decision

- A Node script `scripts/build-songs.ts` runs before `vite build` (`npm run build:songs`):
  1. Load `score.gp` with alphaTab's importer (`alphaTab.importer.ScoreLoader.loadScoreFromBytes`).
  2. Select the bass track (sidecar `bassTrack`, else the first 4-string track whose name contains "bass").
  3. Convert to the normalised model (ticks at 960 PPQ, tempo map, bars with time signatures and section markers, events with string/fret/pitch/duration/tie flags, rests).
  4. Run chunking (ADR-0006) and fingering (ADR-0007), apply sidecar overrides.
  5. Write `public/data/songs/<slug>.json` and `public/data/catalog.json`.
- The script validates each sidecar against `schemas/song.schema.json` and fails the build on errors.
- If alphaTab's importer cannot run in Node for a given file, fall back to reading `Content/score.gpif` directly (GP7/8 only). A Python prototype of that parser is in `reference/gpif-parse-prototype.py`.

## Consequences

- The runtime bundle does not include alphaTab.
- Algorithms are unit-tested on real files in Node.
- Adding a song means adding a folder and pushing; CI regenerates everything.
