// Loop controller (system description §5.1, ADR-0008, ADR-0021): chunk bounds, passes, repeat
// modes, "next chunk" and restart, and the rests between the chunks (ADR-0031). Pure state transitions;
// the practice engine applies them to the clock and the session store. The same rules hold for every
// playback source.
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

/**
 * The bars outside every chunk, where the bass rests, are played and never looped (ADR-0031):
 * `before` is the rest that leads into chunk `chunkIndex`, `after` the one that ends the song.
 */
export type RestSide = 'before' | 'after';
export type LoopPlace = Pick<LoopState, 'chunkIndex' | 'rest'>;

export interface LoopState {
  chunkIndex: number;
  /** Playing the rest next to chunk `chunkIndex`; null inside the chunk. */
  rest: RestSide | null;
  pass: number; // 1-based, the pass being played
  passes: number; // target passes per chunk in `advance` mode
  repeatMode: RepeatMode;
  done: Record<number, number>; // chunk index → tempo % it was completed at
}

export function initialLoop(passes = 3, repeatMode: RepeatMode = DEFAULT_REPEAT_MODE): LoopState {
  return { chunkIndex: 0, rest: null, pass: 1, passes, repeatMode, done: {} };
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

/** Absolute tick range of a bar range: from its first bar's start to its last bar's end. */
export function barsRange([from, to]: [number, number], bars: Bar[]): TickRange {
  const first = bars[from - 1]!;
  const last = bars[to - 1]!;
  return { start: first.startTick, end: last.startTick + last.durTicks };
}

/** Absolute tick range of a chunk. */
export function chunkRange(chunk: Chunk, bars: Bar[]): TickRange {
  return barsRange(chunk.bars, bars);
}

/** The bars of the rest next to a chunk, or null when the chunk starts (or ends) without one. */
export function restBars(chunks: Chunk[], barCount: number, chunkIndex: number, side: RestSide): [number, number] | null {
  const chunk = chunks[chunkIndex]!;
  const from = side === 'before' ? (chunks[chunkIndex - 1]?.bars[1] ?? 0) + 1 : chunk.bars[1] + 1;
  const to = side === 'before' ? chunk.bars[0] - 1 : (chunks[chunkIndex + 1]?.bars[0] ?? barCount + 1) - 1;
  return from <= to ? [from, to] : null;
}

export type RestPlace = { chunkIndex: number; rest: RestSide; bars: [number, number] };

/** Every rest of the song in order: one before each chunk that has one, and the one after the last chunk. */
export function restPlaces(chunks: Chunk[], barCount: number): RestPlace[] {
  const places: RestPlace[] = [];
  chunks.forEach((_, chunkIndex) => {
    const bars = restBars(chunks, barCount, chunkIndex, 'before');
    if (bars) places.push({ chunkIndex, rest: 'before', bars });
  });
  const last = chunks.length - 1;
  const tail = last >= 0 ? restBars(chunks, barCount, last, 'after') : null;
  if (tail) places.push({ chunkIndex: last, rest: 'after', bars: tail });
  return places;
}

/** Bar 1: the rest before the first chunk when the bass enters later, else the first chunk. */
export function songStart(chunks: Chunk[], barCount: number): LoopPlace {
  return { chunkIndex: 0, rest: restBars(chunks, barCount, 0, 'before') ? 'before' : null };
}

/** A stored place, with a rest the song does not have (any more) replaced by its chunk. */
export function validPlace(place: LoopPlace, chunks: Chunk[], barCount: number): LoopPlace {
  const { chunkIndex, rest } = place;
  const exists = rest && (rest === 'before' || chunkIndex === chunks.length - 1) && restBars(chunks, barCount, chunkIndex, rest);
  return { chunkIndex, rest: exists ? rest : null };
}

/** The bars being played: the chunk's, or those of the rest next to it. */
export function placeBars(place: LoopPlace, chunks: Chunk[], barCount: number): [number, number] {
  const chunk = chunks[place.chunkIndex]!;
  return (place.rest && restBars(chunks, barCount, place.chunkIndex, place.rest)) ?? chunk.bars;
}

/** Absolute tick range of the chunk or rest being played. */
export function loopRange(place: LoopPlace, chunks: Chunk[], bars: Bar[]): TickRange {
  return barsRange(placeBars(place, chunks, bars.length), bars);
}

/** True when the current pass is the last one and the loop will move on to the next chunk at its end. */
export function willAdvance(state: LoopState, chunkCount: number): boolean {
  if (state.rest) return state.rest === 'before';
  return lastPass(state) && state.chunkIndex < chunkCount - 1;
}

/**
 * The chunk the loop is about to move on to (through the rest before it, if any), else null; for
 * the "next chunk" preview of the Next square.
 */
export function advanceChunk(state: LoopState, chunkCount: number): number | null {
  if (!willAdvance(state, chunkCount)) return null;
  return state.rest ? state.chunkIndex : state.chunkIndex + 1;
}

/** Where the loop goes when the current pass ends, or null when the song is over. */
function placeAfterPass(state: LoopState, chunks: Chunk[], barCount: number): LoopPlace | null {
  const { chunkIndex } = state;
  if (state.rest === 'before') return { chunkIndex, rest: null };
  if (state.rest === 'after') return null;
  if (!lastPass(state)) return { chunkIndex, rest: null };
  if (chunkIndex < chunks.length - 1) return { chunkIndex: chunkIndex + 1, rest: restBars(chunks, barCount, chunkIndex + 1, 'before') ? 'before' : null };
  // The last chunk: play through goes on to the end of the song, the other modes keep looping it.
  if (state.repeatMode !== 'once') return { chunkIndex, rest: null };
  return restBars(chunks, barCount, chunkIndex, 'after') ? { chunkIndex, rest: 'after' } : null;
}

/** The pass being played is the last of the song: playback stops at its end. */
export function endsSong(state: LoopState, chunks: Chunk[], barCount: number): boolean {
  return placeAfterPass(state, chunks, barCount) === null;
}

/**
 * The range to continue with when the current pass reaches its end, or null to stop there. A
 * chunk is followed by the rest after it, so playback runs on through the bars where the bass
 * rests (ADR-0031).
 */
export function rangeAfterPass(state: LoopState, chunks: Chunk[], bars: Bar[]): TickRange | null {
  const next = placeAfterPass(state, chunks, bars.length);
  return next && loopRange(next, chunks, bars);
}

/**
 * A pass has been heard to the end and playback continued at `next` (the range the clock chose
 * through `rangeAfterPass` when it scheduled the wrap). Continuing outside the chunk, in a rest or
 * in another chunk, means the loop advanced: the finished chunk is marked done at the tempo used.
 * A rest marks nothing. A null `next` means playback stopped at the end of the song: a chunk is
 * done, and the chunk or rest stays selected at pass 1.
 */
export function completePass(state: LoopState, next: TickRange | null, chunks: Chunk[], bars: Bar[], tempoPct: number): LoopState {
  const current = loopRange(state, chunks, bars);
  const finished = { ...state.done, [state.chunkIndex]: tempoPct };
  const done = !state.rest && lastPass(state) ? finished : state.done;
  if (!next) return { ...state, pass: 1, done };
  if (next.start === current.start && next.end === current.end) return { ...state, pass: state.pass + 1, done };
  const index = chunks.findIndex((c) => chunkRange(c, bars).start === next.start);
  const rest = restPlaces(chunks, bars.length).find((p) => barsRange(p.bars, bars).start === next.start);
  const place: LoopPlace = index >= 0 ? { chunkIndex: index, rest: null } : rest ? { chunkIndex: rest.chunkIndex, rest: rest.rest } : state;
  return { ...state, chunkIndex: place.chunkIndex, rest: place.rest, pass: 1, done: state.rest ? state.done : finished };
}

/** Selecting a chunk (practice plan, "Next chunk", restart) starts it at pass 1 without marking anything done. */
export function selectChunk(state: LoopState, index: number, chunkCount: number): LoopState {
  return { ...state, chunkIndex: Math.max(0, Math.min(chunkCount - 1, index)), rest: null, pass: 1 };
}

/** Selecting a rest (practice plan, the start of the song): it is played once, into the chunk after it. */
export function selectPlace(state: LoopState, place: LoopPlace): LoopState {
  return { ...state, chunkIndex: place.chunkIndex, rest: place.rest, pass: 1 };
}

/** The chunk after this one; from a rest, the chunk it leads into. */
export function nextChunk(state: LoopState, chunkCount: number): LoopState {
  return selectChunk(state, state.rest === 'before' ? state.chunkIndex : state.chunkIndex + 1, chunkCount);
}

/** The chunk before this one; from a rest, the chunk it follows. The rest before the first chunk stays. */
export function prevChunk(state: LoopState, chunkCount: number): LoopState {
  if (state.rest === 'before' && state.chunkIndex === 0) return { ...state, pass: 1 };
  return selectChunk(state, state.rest === 'after' ? state.chunkIndex : state.chunkIndex - 1, chunkCount);
}

/** No chunk follows: "Next chunk" has nowhere to go. */
export function onLastChunk(place: LoopPlace, chunkCount: number): boolean {
  return place.chunkIndex >= chunkCount - 1 && place.rest !== 'before';
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
