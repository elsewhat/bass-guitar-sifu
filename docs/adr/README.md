# Architecture decision records

| ADR | Title | Status |
|---|---|---|
| [0001](0001-hosting-and-access.md) | Hosting and access control | Superseded by 0012 |
| [0002](0002-frontend-stack.md) | Frontend stack | Accepted |
| [0003](0003-song-data-format.md) | Song data format | Accepted, sidecar part superseded by 0013, amended by 0023 and 0024 |
| [0004](0004-build-time-preprocessing.md) | Build-time preprocessing of Guitar Pro files | Accepted, amended by 0014 and 0023 |
| [0005](0005-strip-renderer.md) | Custom SVG renderer for the notation and tab strip | Superseded by 0017 |
| [0006](0006-chunking.md) | Chunking strategy | Accepted, amended by 0015 and 0031 |
| [0007](0007-fingering.md) | Fingering recommendation | Accepted |
| [0008](0008-playback-sources.md) | Playback sources behind one clock | Accepted, amended by 0016, 0017, 0018, 0020, 0022 and 0028 |
| [0009](0009-string-colours.md) | String colour palette | Accepted |
| [0010](0010-progress-storage.md) | Practice progress in the browser | Accepted, amended by 0031 |
| [0011](0011-content-licensing.md) | Third-party content | Accepted, amended by 0012, 0022, 0024, 0026, 0028, 0029, 0030 and 0032 |
| [0012](0012-public-github-pages.md) | Public repository and public GitHub Pages | Accepted, amended by 0022, 0024 and 0028 |
| [0013](0013-yaml-sidecar.md) | YAML sidecar per song | Accepted, amended by 0022, 0023, 0024, 0026, 0028, 0029 and 0030 |
| [0014](0014-committed-generated-data.md) | Generated song data is committed | Accepted |
| [0015](0015-song-intake-skill.md) | Song intake through the `preprocess-song` agent skill | Accepted, amended by 0022, 0028, 0029 and 0030 |
| [0016](0016-playback-scope-v1.md) | Playback sources for version 1 and sync authoring | Accepted, amended by 0022 and 0028 |
| [0017](0017-alphatab-runtime.md) | alphaTab at runtime for the strip, Synth and YouTube sync | Accepted, amended by 0019, 0023 and 0028 |
| [0018](0018-clock-and-loop-interface.md) | Clock interface and loop decisions ahead of the audio | Proposed, amended by 0019, 0021, 0025 and 0031 |
| [0019](0019-synth-source-adapter.md) | Synth source on the strip's alphaTab player | Proposed, amended by 0020 |
| [0020](0020-mixer.md) | Mixer per source | Proposed, amended by 0022 and 0028 |
| [0021](0021-repeat-modes.md) | Repeat modes, including play-through | Proposed, amended by 0031 |
| [0022](0022-music-source.md) | Music source, audio rendered from the transcription | Proposed |
| [0023](0023-repeat-unrolling.md) | Repeat signs are unrolled into played bars | Proposed |
| [0024](0024-lyrics.md) | Lyrics from the Guitar Pro vocal track and from song.yaml | Proposed, amended by 0028 |
| [0025](0025-count-in.md) | One-bar count-in before playback starts | Proposed, amended by 0028 |
| [0026](0026-album-covers.md) | Album covers in the header | Proposed |
| [0027](0027-screen-wake-lock.md) | Keep the screen awake while playing | Proposed |
| [0028](0028-youtube-source.md) | YouTube source on its own clock, synced with Songsterr's bar points | Proposed, amended by 0029 |
| [0029](0029-song-copies-and-measured-sync.md) | Copies of a song, and sync measured in the recording | Proposed, amended by 0030 |
| [0030](0030-transcribed-from-the-recording.md) | Bass parts transcribed from the recording by analysis | Proposed |
| [0031](0031-rests-are-played.md) | The bars where the bass rests are played, and the library starts a song at bar 1 | Proposed |
| [0032](0032-practice-videos.md) | Practice videos recorded from the app | Accepted; the capture superseded by 0033 and 0035, kept as `--engine chrome` |
| [0033](0033-practice-videos-with-obs.md) | Practice videos recorded with OBS | Superseded as the default by 0035, kept as `--engine obs` |
| [0034](0034-smooth-strip-scroll.md) | Smooth strip scroll: gradual speed changes, a steadied frame tick and a loop label of its own | Proposed |
| [0035](0035-practice-videos-from-the-screen.md) | Practice videos recorded from the screen (Windows Graphics Capture, sound by OBS): the default on Windows | Accepted |
| [0036](0036-record-mode.md) | Record mode (`?record=1`): YouTube and play through, without the source switch, Restart chunk, the repeat button and Next chunk | Proposed |
| [0037](0037-stage-width-16-9.md) | The stage is as wide as the window, from 16:10 (1440 px) to 16:9 (1600 px); wider screens keep 16:9 | Proposed |

Format: Context, Decision (or Options for proposed ADRs), Consequences, Alternatives where relevant. New ADRs get the next number; superseded ADRs keep their file with status "Superseded by ADR-00NN".
