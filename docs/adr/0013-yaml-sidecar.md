# ADR-0013: YAML sidecar per song

Status: Accepted, amended by ADR-0022 (`media.music`)
Date: 2026-09-28
Supersedes: the sidecar part of ADR-0003 (`song.json`).

## Context

The sidecar is edited by hand and by the `preprocess-song` agent skill (ADR-0015). It holds chunk lists, review notes and sync anchors. JSON does not allow comments, and long lists of anchors are noisy in JSON.

## Decision

- Each song folder holds `songs/<slug>/score.gp` and `songs/<slug>/song.yaml`.
- `song.yaml` is parsed with the `yaml` package and validated with `ajv` against `schemas/song.schema.json` (JSON Schema 2020-12). Invalid sidecars fail the build.
- The first line is `# yaml-language-server: $schema=../../schemas/song.schema.json`, so editors validate while typing.
- Fields:

  | Field | Required | Written by | Purpose |
  |---|---|---|---|
  | `title`, `artist` | yes | skill | Display metadata. Overrides the `.gp` metadata. |
  | `source` | yes | skill | Original file name and date from the `music/` inbox. |
  | `bassTrack` | yes | skill | Track name or zero-based index in `score.gp`. |
  | `tempo.note` | no | skill | Free-text remark, for example a half-time notation. |
  | `media.youtube` | no | skill / owner | `videoId` and `sync` anchors (`bar`, optional `tick`, `ms`). |
  | `chunks` | yes | skill | Ordered list of `{ name, bars: [first, last] }`. |
  | `fingeringOverrides` | no | skill / owner | `{ bar, tick, string?, fret?, finger? }` pins for the solver. |
  | `notes` | no | skill | Review notes: re-tabs, awkward passages, doubts. |

- Spotify fields are removed for v1 (ADR-0016).

## Consequences

- Comments survive in the sidecar, so the skill can explain its choices in place.
- The schema file is still JSON Schema, which lets both editors and the build use it.
