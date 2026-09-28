# ADR-0008: Playback sources behind one clock

Status: Accepted, amended by ADR-0016 (v1 sources) and ADR-0017
Date: 2026-09-28

## Context

Four playback sources: YouTube video, Spotify track, synthesised notes, spoken count. They differ in timing accuracy and tempo control:

- YouTube IFrame Player API: `setPlaybackRate` accepts only rates the player supports and rounds other values. `seekTo` goes to the nearest keyframe unless the target is already buffered.
- Spotify Web Playback SDK: no playback-rate control. Requires a Premium account and OAuth (PKCE works without a server). Since February–March 2026, Development Mode apps require Premium, allow one Development Mode client ID per developer and at most five authorised users.
- Web Audio API: sample-accurate scheduling for Synth and Count.

## Decision

- Interface `PlaybackClock` with `play()`, `pause()`, `seek(position)`, `setRate(r)`, `getPosition()` (score bar + tick), `capabilities` (`rates: number[] | 'continuous'`, `video: boolean`), and events `passCompleted`, `ended`.
- `YouTubeClock`: maps video time to score position with the sidecar sync map; polls `getCurrentTime()` in `requestAnimationFrame`; snaps rate to `getAvailablePlaybackRates()`.
- `SpotifyClock`: optional, feature-flagged, full speed only. Implemented last.
- `SynthClock`: plays the bass line with a simple Web Audio instrument; continuous rate.
- `CountClock`: plays WAV samples `one, two, three, four, and` (and `five`, `six`, … as needed for other meters) from `public/audio/count/`; continuous rate; look-ahead scheduler (≈100 ms ahead, 25 ms interval).
- The loop controller (chunk bounds, passes, auto-advance) sits above the clock and is identical for all sources.

## Consequences

- UI components never know which source is active.
- Tempo control shows the actual effective rate for YouTube and is disabled for Spotify.
- Sync maps are needed per recording; a small "tap anchors" editor is part of milestone 8.
