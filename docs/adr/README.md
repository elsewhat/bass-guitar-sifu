# Architecture decision records

| ADR | Title | Status |
|---|---|---|
| [0001](0001-hosting-and-access.md) | Hosting and access control | Superseded by 0012 |
| [0002](0002-frontend-stack.md) | Frontend stack | Accepted |
| [0003](0003-song-data-format.md) | Song data format | Accepted, sidecar part superseded by 0013 |
| [0004](0004-build-time-preprocessing.md) | Build-time preprocessing of Guitar Pro files | Accepted, amended by 0014 |
| [0005](0005-strip-renderer.md) | Custom SVG renderer for the notation and tab strip | Superseded by 0017 |
| [0006](0006-chunking.md) | Chunking strategy | Accepted, amended by 0015 |
| [0007](0007-fingering.md) | Fingering recommendation | Accepted |
| [0008](0008-playback-sources.md) | Playback sources behind one clock | Accepted, amended by 0016, 0017, 0018, 0020 and 0022 |
| [0009](0009-string-colours.md) | String colour palette | Accepted |
| [0010](0010-progress-storage.md) | Practice progress in the browser | Accepted |
| [0011](0011-content-licensing.md) | Third-party content | Accepted, amended by 0012 and 0022 |
| [0012](0012-public-github-pages.md) | Public repository and public GitHub Pages | Accepted, amended by 0022 |
| [0013](0013-yaml-sidecar.md) | YAML sidecar per song | Accepted, amended by 0022 |
| [0014](0014-committed-generated-data.md) | Generated song data is committed | Accepted |
| [0015](0015-song-intake-skill.md) | Song intake through the `preprocess-song` agent skill | Accepted, amended by 0022 |
| [0016](0016-playback-scope-v1.md) | Playback sources for version 1 and sync authoring | Accepted, amended by 0022 |
| [0017](0017-alphatab-runtime.md) | alphaTab at runtime for the strip, Synth and YouTube sync | Accepted, amended by 0019 |
| [0018](0018-clock-and-loop-interface.md) | Clock interface and loop decisions ahead of the audio | Proposed, amended by 0019 and 0021 |
| [0019](0019-synth-source-adapter.md) | Synth source on the strip's alphaTab player | Proposed, amended by 0020 |
| [0020](0020-mixer.md) | Mixer per source | Proposed, amended by 0022 |
| [0021](0021-repeat-modes.md) | Repeat modes, including play-through | Proposed |
| [0022](0022-music-source.md) | Music source, audio rendered from the transcription | Proposed |

Format: Context, Decision (or Options for proposed ADRs), Consequences, Alternatives where relevant. New ADRs get the next number; superseded ADRs keep their file with status "Superseded by ADR-00NN".
