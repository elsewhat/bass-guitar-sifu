# ADR-0021: Repeat modes, including play-through

Status: Proposed
Date: 2026-09-29
Amends: ADR-0018 (loop rules).

## Context

The loop has two behaviours today (`LoopState.autoAdvance`): repeat each chunk N times and then advance, or loop the chunk indefinitely. The owner also wants to play a song without repeating any chunk, going straight from one chunk to the next.

## Decision

- Replace `autoAdvance: boolean` with `repeatMode: 'advance' | 'loop' | 'once'`:
  - `advance`: repeat each chunk `passes` times, then the next chunk (today's default).
  - `loop`: repeat the current chunk until the player moves on.
  - `once` (**play through**): every chunk is played once; at the end of the pass the next chunk starts. Tacet ranges are still skipped.
- The repeat button in the transport bar cycles `advance → once → loop → advance`. Icons: repeat arrows (green) for `advance`, arrow to a bar (green) for `once`, repeat-one (white) for `loop`. The text next to it is `2/3` with pass dots, `Play through`, or `Pass 5`.
- Changing the mode resets the pass counter to 1 and never interrupts playback.
- `rangeAfterPass` uses a target of 1 for `once` and `passes` for `advance`; `loop` always returns the same range. In `once` mode a chunk is marked done with the tempo used when its pass completes, as in `advance`.
- The practice plan's current row shows `play through`, `pass 5 · looping` or `pass 2 of 3`.
- The mode is stored in `bass-trainer:v1:settings` (ADR-0010).

## Consequences

- The Count and Synth clocks need no change: the next range is already decided in `onRangeEnd` when the wrap is scheduled (ADR-0018), so play-through runs chunk to chunk without gaps.
- Tests in `src/playback/playback.test.ts` get one case per mode, including the last chunk (in `once` mode the last chunk is marked done and then loops, as in `advance`).

## Implementation notes (2026-09-29)

- `RepeatMode`, `passTarget`, `nextRepeatMode`, `setRepeatMode`, `passLabel` and `passCounterText` in `src/playback/loop.ts`; `cycleRepeatMode` in the practice engine.
- **Default: play through** (`DEFAULT_REPEAT_MODE = 'once'`), set by the owner after the first review. A stored mode overrides it.
- The mode is saved in `bass-trainer:v1:settings.repeatMode` (`src/state/storage.ts`) and kept when switching songs.
