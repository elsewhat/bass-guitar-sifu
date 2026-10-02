# ADR-0025: One-bar count-in before playback starts

Status: Proposed (implemented, awaiting owner review)
Date: 2026-09-30
Amends: ADR-0018 (`PlaybackClock.play` takes options; new `countInState()`).

## Context

- The owner wants every start of play on a chunk to be counted in with the metronome first (2026-09-30). Before this, Play started the source at once, so the first notes of a chunk came without warning.
- Playback can start in three ways: Play (button or `Space`), a chunk change while playing (practice plan, `Next chunk`, `←` / `→`), and `Restart chunk` while playing. The loop also moves on by itself: another pass, auto-advance (`advance` mode) and play-through (ADR-0021).
- The owner chose (2026-09-30):
  - a count-in **only when Play starts**, which includes a chunk change or a restart while playing. Passes, auto-advance and play-through continue without a gap, so the song still flows in play-through;
  - **one bar** long.
- The sources start differently. The Metronome schedules on the Web Audio clock (ADR-0018), the Synth starts alphaTab's player (ADR-0019), and Music starts an `<audio>` element (ADR-0022).

## Decision

- **Length and counts.** One bar in the meter of the bar playback starts in, at that bar's tempo × the tempo setting (Music: 100 %). The count-in ends exactly where playback starts. From a bar start it counts `1 2 3 4`. From mid-bar, for example after a pause on beat 3, it counts `3 4 1 2` into beat 3. Only the beats are sounded (no `&`), with the Metronome's click (accent on 1) and voice samples. The time math is the pure function `countInPlan` in `src/playback/count-in.ts`, with unit tests.
- **When.** `play({ countIn: true })` is used by `togglePlay`, and by chunk changes and restarts while playing: the engine pauses the clock, moves it and plays again with a count-in (`jump` in `src/practice/engine.ts`). Wraps inside the clock (passes, advance, play-through) never count in. `play()` without options starts at once, as before.
- **Metronome source.** `CountClock` schedules the count-in sounds on its own audio clock and starts the timeline right after them, so the first count of the chunk follows the count-in exactly. A tempo change during the count-in restarts it at the new tempo.
- **Synth and Music.** A `CountInPlayer` (`src/playback/count-in-player.ts`) plays the same counts on its own audio context through a small port (`CountInPort`, faked in the clock tests). The clock starts its player when the count-in's end is due on the audio clock. The first note then follows by about the player's own start-up time, which is not compensated. Pause during the count-in cancels it and the player never starts.
- **Sounds and mixer.** The Metronome's sounds moved to `CountSounds` (`src/playback/count-sounds.ts`), shared by the Count source and the count-in player. The count-in of every source follows the Metronome's **Click** and **Voice** channels and the master (ADR-0020). If the click is muted and there are no samples, the count-in is silent and only the cells show it.
- **Position and view.** During the count-in, `getTick()` stays at the start tick, so the strip, the Now square, the fretboard and the lyrics wait. `countInState()` gives the meter and the eighth being counted, read once per animation frame. The Metronome's count cells show the count-in bar. The Synth and Music views show the same cells only during the count-in, as large cells or, with lyrics on, as small cells in the source row. `isPlaying()` is true during the count-in, so the transport shows Pause.

## Consequences

- Every Play now takes one extra bar (about 1.5–3 s at the catalogue's tempos, more at low tempo settings). The e2e tests wait longer for the strip to move.
- The Synth and Music can start a little after the last count, by their start-up latency. If that is audible, the count-in can resolve earlier by a measured latency.
- The count-in length is fixed at one bar. A setting (off, 1 or 2 bars) can be added later without changing the clocks: `countInPlan` would take the bar count.

## Alternatives

- **Count-in at every chunk change, including auto-advance and play-through.** Rejected by the owner: it puts a one-bar gap between the chunks of a play-through.
- **A wrapper clock that counts in before any source.** It would start the Metronome's timeline from a timer instead of the audio clock, so the first count of the chunk would drift from the count-in by the timer's jitter.
- **Showing the previous bar during the count-in (negative position).** The strip, the fretboard and the lyrics would show notes from before the chunk as current.
