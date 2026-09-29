# ADR-0019: Synth source on the strip's alphaTab player

Status: Proposed (implemented, awaiting owner review)
Date: 2026-09-29
Amends: ADR-0017 (player settings), ADR-0018 (how the alphaTab adapters wrap).

## Context

ADR-0017 makes the alphaTab player the Synth source and ADR-0018 defines the clock it must implement. Building it against alphaTab 1.8.4 showed:

- The strip already has an `AlphaTabApi` with the score loaded. A second instance would load and parse the score twice.
- alphaTab generates MIDI for **every track** of the `.gp` file, not only the rendered bass track.
- Setting `playbackRange` makes the synthesizer **seek to the range start**. The range cannot be changed ahead of the end without jumping back.
- At the end of a looped range alphaTab waits until the buffered audio has played, fires `playerFinished` and seeks to the range start. That event marks the audible wrap exactly.
- Loading a new MIDI (a new song) resets the player's playback range.
- alphaTab reports positions only when the output has consumed a buffer, about every 46 ms.
- Bug in 1.8.4: once the worker player exists, subscribing to `api.midiLoaded` reads the worker player's `loadedMidiInfo`, whose getter calls itself (stack overflow).

## Decision

- **One alphaTab instance.** The Synth plays through the strip's `AlphaTabApi`. The strip starts with `playerMode = Disabled`. The first time the Synth is chosen, `Strip.enableSynth` sets `EnabledSynthesizer` and `player.soundFont` and calls `api.updateSettings()`. alphaTab then starts its worker, loads the soundfont and the current score's MIDI. Nothing of the player is loaded for Count users. `src/strip/strip-host.ts` lets the practice engine reach the strip that `TabStrip.tsx` created.
- **Readiness.** The strip counts MIDI loads in flight (`midiLoad` / `midiLoaded`, subscribed before the player exists because of the bug above). The player is ready for a song when that song's score was rendered last, no MIDI is in flight, and `api.isReadyForPlayback` is true. The video cell shows "Loading sounds… NN %" and Play is disabled until then.
- **Track mix.** `SynthMix` (`src/playback/synth-mix.ts`): `bass` (solo the bass track, the default), `band` (every track) and `backing` (every track except the bass, for playing along). It is applied with `changeTrackSolo` / `changeTrackMute` whenever the player reports ready. The session store has `synthMix` and the engine has `setSynthMix`; there is no switch in the UI yet.
- **Clock** (`SynthClock`, `src/playback/synth-clock.ts`). It talks to a small `SynthPlayer` port, implemented over alphaTab in `src/strip/synth-player.ts`, so the clock is unit tested with a fake player.
  - Position: extrapolated per frame from the last report and corrected 20 % toward each report, as in the ADR-0017 clock guide.
  - About 250 ms before the range end it calls `onRangeEnd` (ADR-0018).
  - Another pass needs nothing: alphaTab loops. `passCompleted` fires on `playerFinished`.
  - A different range (auto-advance) is set as the player's range on `playerFinished`, which moves the player to its start. This is the same for a chunk right after the current one and one after a tacet gap.
  - A position that drops by more than a quarter note while the next range is chosen also counts as the wrap, in case the event is missed.
- **Source switch** keeps the position when it is inside the current chunk, in both directions.

## Consequences

- The pass counter and auto-advance behave as with the Count source. At a wrap the audio has a short gap: alphaTab drains its buffer before it loops, and when advancing, the range change arrives a few milliseconds after the wrap. In the preview, the reported position lost about 40 ms across an advance. Whether that is audible needs a listen in a normal browser.
- alphaTab's pause moves its own position to the first beat; the clock keeps the paused tick and seeks back to it on play.
- The position is the one alphaTab reports, which does not include the audio device's output latency. If the ring and scroll lag the sound noticeably, an output-latency offset can be added in `synth-player.ts`.
- The soundfont (1.35 MB) and alphaTab's worker and worklet (about 2.3 MB each) are only fetched when the Synth is chosen.
- Changing the tempo during Synth playback makes alphaTab re-seek, which can be heard as a small glitch.

## Alternatives

- **Widen the range ahead of the end** so playback runs into the next chunk without a wrap. It does not work, because setting the range seeks to its start.
- **A second, hidden alphaTab instance for audio.** This would parse the score twice and duplicate the readiness logic, with no benefit while one instance can do both.
