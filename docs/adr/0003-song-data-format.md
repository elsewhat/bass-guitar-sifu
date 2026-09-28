# ADR-0003: Song data format

Status: Accepted, sidecar part superseded by ADR-0013
Date: 2026-09-28

## Context

Songs arrive as Guitar Pro files. The app also needs data Guitar Pro does not hold: recording ids, sync anchors between score and recording, chunk overrides, fingering overrides. Formats considered: Guitar Pro (`.gp`, GP7/8 is a zip with `Content/score.gpif` XML), MusicXML, MIDI, alphaTex, and a custom JSON.

MIDI has no string or fret information, so tab cannot be reproduced from it. MusicXML can carry tab but is verbose and rarely what tab sites export. Guitar Pro is what the owner has and what tab sites export.

## Decision

- Each song is a folder `songs/<slug>/` with:
  - `score.gp`: the unmodified Guitar Pro file, the source of truth for notes, rhythm, tuning, tempo map, time signatures and section markers.
  - `song.json`: hand-edited sidecar for media, sync anchors and overrides (schema in `docs/system-description.md` §6.2 and `schemas/song.schema.json`).
- The build produces a normalised JSON per song (§6.1) and a `catalog.json`. The runtime reads only these generated files.
- Slugs are lower-case ASCII with hyphens, derived from the title (`un-chien-d-espace`).

## Consequences

- Replacing a tab means replacing `score.gp`; sidecar overrides reference bar and tick, so they may need review when the tab changes. The build warns when an override points at a position without a note.
- Generated JSON is not committed; CI builds it.
