# ADR-0018: Clock interface and loop decisions ahead of the audio

Status: Proposed (implemented in slice 1, awaiting owner review)
Date: 2026-09-28
Amends: ADR-0008.

## Context

ADR-0008 sketches `PlaybackClock` with `getPosition()` (bar + tick) and a `passCompleted` event, and says the clock seeks to the chunk start at the end of each pass. Building the Count source showed two problems with that sketch:

- The Count source schedules audio about 100 ms ahead (look-ahead scheduler). When the end of a pass is scheduled, the next sounds must already be those of the next pass or the next chunk. If the loop controller only reacts to an audible `passCompleted` and then seeks, the first count of the next chunk is doubled or cut.
- Chunks are not always contiguous (tacet ranges lie between them), so "keep playing" is not the same as "advance".

## Decision

- `PlaybackClock` (`src/playback/clock.ts`) works in **absolute ticks** (PPQ 960). The bar follows from the song's bar list. Methods: `play`, `pause`, `isPlaying`, `seek(tick)`, `setRate(rate)`, `setRange(range)`, `getTick()`, `onPassCompleted(listener)`, `dispose`, plus `capabilities` as in ADR-0008.
- The clock loops `setRange`'s range itself. When it reaches the range end it calls **`onRangeEnd(range)`**, set by the loop controller, and continues with the range it returns: the same chunk for another pass, or the next chunk when the last pass is done and auto-advance is on. The call happens when the wrap is scheduled, slightly before it is heard.
- **`passCompleted({ from, to })` fires when the wrap is audible.** The controller derives the new state from `to` (same range: pass + 1; other range: chunk done at the current tempo, next chunk, pass 1). It does not use its own state at that moment, so a setting changed between scheduling and hearing cannot make the two disagree.
- The loop rules are pure functions in `src/playback/loop.ts` (`rangeAfterPass`, `completePass`, `selectChunk`, `nextChunk`) with unit tests. `src/practice/engine.ts` applies them to the clock and the session store.
- Loop details decided while building slice 1:
  - "Restart chunk" goes back to the chunk start and keeps the pass count.
  - On the last chunk, auto-advance has nowhere to go: the chunk is marked done after its passes and keeps looping.
  - With auto-advance off, passes keep counting past the target ("pass 5").
- The alphaTab-based sources (Synth, YouTube, step 6) implement the same interface. alphaTab loops `playbackRange` itself, so their adapters call `onRangeEnd` when they detect the wrap and set the next `playbackRange` then.

## Consequences

- All sources share the loop controller, as ADR-0008 intended, and the Count source loops without gaps or doubled counts, also when it advances to a chunk after a tacet range.
- The UI never reads bar + tick from the clock. It calls `getTick()` once per animation frame (`src/playback/frame.ts`) and looks up the bar with `barIndexAt`.
- The Synth and YouTube adapters may wrap a little late (alphaTab reports positions a few times per second). The ADR-0017 extrapolation hides this for the scroll; the pass count may update up to one position event late.
