// Loop controller (system description §5.1, ADR-0008, ADR-0021): chunk bounds, passes, repeat
// modes, "next chunk" and restart. Pure state transitions; the practice engine applies them to the clock and
// the session store. The same rules hold for every playback source.
import type { Bar, Chunk } from '../core/model';
import type { TickRange } from '../core/plucks';

/**
 * What happens at the end of a pass (ADR-0021): `advance` repeats each chunk `passes` times and
 * then moves on, `once` (play through) plays every chunk once, `loop` repeats the chunk until the
 * player moves on.
 */
export type RepeatMode = 'advance' | 'once' | 'loop';
export const REPEAT_MODES: readonly RepeatMode[] = ['advance', 'once', 'loop']; // the button's cycle
/** Play through until the player picks another mode (owner, 2026-09-29). */
export const DEFAULT_REPEAT_MODE: RepeatMode = 'once';

export interface LoopState {
  chunkIndex: number;
  pass: number; // 1-based, the pass being played
  passes: number; // target passes per chunk in `advance` mode
  repeatMode: RepeatMode;
  done: Record<number, number>; // chunk index → tempo % it was completed at
}

export function initialLoop(passes = 3, repeatMode: RepeatMode = DEFAULT_REPEAT_MODE): LoopState {
  return { chunkIndex: 0, pass: 1, passes, repeatMode, done: {} };
}

/** Passes before the loop moves on: `passes`, 1 in play-through mode, none when looping. */
export function passTarget(state: Pick<LoopState, 'passes' | 'repeatMode'>): number | null {
  if (state.repeatMode === 'loop') return null;
  return state.repeatMode === 'once' ? 1 : state.passes;
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]!;
}

/** Changing the mode restarts the pass count and leaves playback alone. */
export function setRepeatMode(state: LoopState, repeatMode: RepeatMode): LoopState {
  return { ...state, repeatMode, pass: 1 };
}

/** The current pass completes the chunk (it is marked done at its end). */
function lastPass(state: LoopState): boolean {
  const target = passTarget(state);
  return target !== null && state.pass >= target;
}

/** Absolute tick range of a chunk: from its first bar's start to its last bar's end. */
export function chunkRange(chunk: Chunk, bars: Bar[]): TickRange {
  const first = bars[chunk.bars[0] - 1]!;
  const last = bars[chunk.bars[1] - 1]!;
  return { start: first.startTick, end: last.startTick + last.durTicks };
}

/** True when the current pass is the last one and the loop will move on at its end. */
export function willAdvance(state: LoopState, chunkCount: number): boolean {
  return lastPass(state) && state.chunkIndex < chunkCount - 1;
}

/** The range to continue with when the current pass reaches the chunk end. */
export function rangeAfterPass(state: LoopState, chunks: Chunk[], bars: Bar[]): TickRange {
  const i = willAdvance(state, chunks.length) ? state.chunkIndex + 1 : state.chunkIndex;
  return chunkRange(chunks[i]!, bars);
}

/**
 * A pass has been heard to the end and playback continued at `next` (the range the clock chose
 * through `rangeAfterPass` when it scheduled the wrap). Continuing in another chunk means the
 * loop advanced: the finished chunk is marked done at the tempo used.
 */
export function completePass(state: LoopState, next: TickRange, chunks: Chunk[], bars: Bar[], tempoPct: number): LoopState {
  const current = chunkRange(chunks[state.chunkIndex]!, bars);
  const done = lastPass(state) ? { ...state.done, [state.chunkIndex]: tempoPct } : state.done;
  if (next.start === current.start && next.end === current.end) return { ...state, pass: state.pass + 1, done };
  const index = chunks.findIndex((c) => chunkRange(c, bars).start === next.start);
  return { ...state, chunkIndex: index < 0 ? state.chunkIndex : index, pass: 1, done: { ...state.done, [state.chunkIndex]: tempoPct } };
}

/** Selecting a chunk (practice plan, "Next chunk", restart) starts it at pass 1 without marking anything done. */
export function selectChunk(state: LoopState, index: number, chunkCount: number): LoopState {
  return { ...state, chunkIndex: Math.max(0, Math.min(chunkCount - 1, index)), pass: 1 };
}

export function nextChunk(state: LoopState, chunkCount: number): LoopState {
  return selectChunk(state, state.chunkIndex + 1, chunkCount);
}

/** Practice plan and loop label: "pass 2 of 3" ("pass 5" past it on the last chunk), "play through", "pass 5 · looping". */
export function passLabel(state: Pick<LoopState, 'pass' | 'passes' | 'repeatMode'>): string {
  if (state.repeatMode === 'once') return 'play through';
  if (state.repeatMode === 'loop') return `pass ${state.pass} · looping`;
  return state.pass <= state.passes ? `pass ${state.pass} of ${state.passes}` : `pass ${state.pass}`;
}

/** Transport bar pass counter: "2/3", "Play through" or "Pass 5". */
export function passCounterText(state: Pick<LoopState, 'pass' | 'passes' | 'repeatMode'>): string {
  if (state.repeatMode === 'once') return 'Play through';
  if (state.repeatMode === 'loop') return `Pass ${state.pass}`;
  return state.pass <= state.passes ? `${state.pass}/${state.passes}` : String(state.pass);
}
