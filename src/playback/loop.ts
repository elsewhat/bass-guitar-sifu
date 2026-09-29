// Loop controller (system description §5.1, ADR-0008): chunk bounds, passes, auto-advance, "next
// chunk" and restart. Pure state transitions; the practice engine applies them to the clock and
// the session store. The same rules hold for every playback source.
import type { Bar, Chunk } from '../core/model';
import type { TickRange } from '../core/plucks';

export interface LoopState {
  chunkIndex: number;
  pass: number; // 1-based, the pass being played
  passes: number; // target passes per chunk
  autoAdvance: boolean; // on: move to the next chunk after `passes`; off: repeat indefinitely
  done: Record<number, number>; // chunk index → tempo % it was completed at
}

export function initialLoop(passes = 3): LoopState {
  return { chunkIndex: 0, pass: 1, passes, autoAdvance: true, done: {} };
}

/** Absolute tick range of a chunk: from its first bar's start to its last bar's end. */
export function chunkRange(chunk: Chunk, bars: Bar[]): TickRange {
  const first = bars[chunk.bars[0] - 1]!;
  const last = bars[chunk.bars[1] - 1]!;
  return { start: first.startTick, end: last.startTick + last.durTicks };
}

/** True when the current pass is the last one and the loop will move on at its end. */
export function willAdvance(state: LoopState, chunkCount: number): boolean {
  return state.autoAdvance && state.pass >= state.passes && state.chunkIndex < chunkCount - 1;
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
  const finished = state.autoAdvance && state.pass >= state.passes;
  const done = finished ? { ...state.done, [state.chunkIndex]: tempoPct } : state.done;
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

/** "pass 2 of 3"; past the target (repeat mode) just "pass 5". */
export function passLabel(state: Pick<LoopState, 'pass' | 'passes'>): string {
  return state.pass <= state.passes ? `pass ${state.pass} of ${state.passes}` : `pass ${state.pass}`;
}
