# ADR-0014: Generated song data is committed

Status: Accepted
Date: 2026-09-28
Amends: ADR-0004 (generated JSON was not committed).

## Context

Chunks and fingering are produced by code and by the `preprocess-song` skill. When an algorithm or a sidecar changes, the effect on every song should be visible in review, not only after deploy.

## Decision

- `npm run build:songs` writes these files to `public/data/`, and they are committed:
  - `catalog.json`: the library list
  - `songs/<slug>.json`: the normalised song (system description §6.1)
  - (`score.gp` is not copied: the app loads it from `songs/<slug>/` through the `song-scores` Vite plugin, ADR-0017)
- Output is deterministic: stable key order, no timestamps, 2-space indentation.
- `npm run build:songs -- --check` regenerates everything in memory and fails if it differs from the committed files. CI runs it before tests and deploy.

## Consequences

- Pull requests show the diff of chunk, fingering and catalogue changes.
- A contributor who edits `song.yaml` must rerun `build:songs`. The check makes a forgotten rerun fail CI instead of shipping stale data.
- The repository grows by the generated JSON, which is estimated at well under 20 MB for 30 songs.
