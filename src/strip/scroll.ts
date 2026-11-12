// Scroll mapping for the strip (ADR-0017, ADR-0034). alphaTab spaces notes by content, not time,
// so tick → x is piecewise linear between beat onsets, and the speed jumps at every onset where
// the spacing changes (most at barlines). The strip therefore follows `scrollMap`:
//   1. the mapping averaged over one bar of 4/4 (it was two beats; ADR-0034),
//   2. its lead or lag behind the exact mapping softly limited (tanh), so notes stay near the
//      playhead when they are plucked,
//   3. that result averaged over one beat. Where the limit holds, step 2 follows the exact mapping
//      and takes over its speed jumps; this last average spreads each of them over a beat.

export interface Anchor {
  tick: number;
  x: number;
}

/** Piecewise-linear x of a tick between anchors (sorted by tick), extended past both ends. */
export function interpolate(anchors: Anchor[], tick: number): number {
  if (anchors.length < 2) return anchors[0]?.x ?? 0;
  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]!.tick <= tick) lo = mid;
    else hi = mid;
  }
  const p = anchors[lo]!;
  const q = anchors[hi]!;
  return q.tick === p.tick ? p.x : p.x + ((tick - p.tick) / (q.tick - p.tick)) * (q.x - p.x);
}

/** The playhead line in the clip area (a 2 px green line): four eighth notes fit to its left (owner, slice 1). */
export const PLAYHEAD_X = 150;
/** Limit (screen px) on the lead or lag of the bar's average, before the last average. */
export const MAX_ONSET_OFFSET = 10;

/**
 * Ticks: one bar of 4/4. alphaTab leaves room after every barline, so over a shorter window the
 * strip sped up and slowed down once a bar even in a bar of even eighths (±9 % in Go with the
 * Flow's intro). A bar's average takes that room up evenly across the bar (ADR-0034).
 */
export const SMOOTH_WINDOW = 3840;
/** Window of the last average: one beat. */
export const EASE_WINDOW = 960;
const SAMPLES = 65; // 60 ticks apart over the window, well inside an eighth note
/** Tick distance between the stored values of a scroll map (a frame is 30 to 60 ticks). */
const STEP = 30;

/** Mean of the beat-onset interpolation over [tick − window/2, tick + window/2]. */
export function smoothedX(anchors: Anchor[], tick: number, window = SMOOTH_WINDOW): number {
  let sum = 0;
  for (let i = 0; i < SAMPLES; i++) sum += interpolate(anchors, tick + window * (i / (SAMPLES - 1) - 0.5));
  return sum / SAMPLES;
}

/**
 * The smoothed mapping with its lead or lag behind the exact note-to-note mapping softly limited
 * to `maxOffset`. Its speed still jumps at onsets where the limit holds; see `scrollMap`.
 */
export function playheadX(anchors: Anchor[], tick: number, maxOffset: number): number {
  const exact = interpolate(anchors, tick);
  return exact + maxOffset * Math.tanh((smoothedX(anchors, tick) - exact) / maxOffset);
}

/**
 * The strip's x for a tick: `playheadX` averaged over one beat, so the speed changes gradually.
 * Computed once per layout into a table with a value every 30 ticks; the returned function
 * interpolates in it (and extends it past both ends).
 */
export function scrollMap(anchors: Anchor[], maxOffset: number): (tick: number) => number {
  if (anchors.length < 2) return () => anchors[0]?.x ?? 0;
  const hs = SMOOTH_WINDOW / STEP / 2; // table steps in half of each window
  const he = EASE_WINDOW / STEP / 2;
  const start = anchors[0]!.tick - SMOOTH_WINDOW;
  const count = Math.ceil((anchors[anchors.length - 1]!.tick + SMOOTH_WINDOW - start) / STEP) + 1;
  // The exact mapping with room for both windows on both sides; value j is at tick start + (j − m) · STEP.
  const m = hs + he;
  const exact = new Float64Array(count + 2 * m);
  for (let j = 0; j < exact.length; j++) exact[j] = interpolate(anchors, start + (j - m) * STEP);
  // The bounded mapping (as playheadX, with the window's mean taken from the table), from j = hs on.
  const smoothed = boxMeans(exact, hs);
  const bounded = new Float64Array(exact.length);
  for (let j = hs; j < exact.length - hs; j++) bounded[j] = exact[j]! + maxOffset * Math.tanh((smoothed[j]! - exact[j]!) / maxOffset);
  const eased = boxMeans(bounded, he);
  const table = eased.subarray(m, m + count);
  return (tick) => {
    const u = (tick - start) / STEP;
    const i = Math.max(0, Math.min(count - 2, Math.floor(u)));
    return table[i]! + (u - i) * (table[i + 1]! - table[i]!);
  };
}

/**
 * Trapezoid means of `values` over [j − half, j + half] (the two end values count half), for every j
 * with room on both sides; the others are left 0.
 */
function boxMeans(values: Float64Array, half: number): Float64Array {
  const sums = new Float64Array(values.length + 1);
  for (let j = 0; j < values.length; j++) sums[j + 1] = sums[j]! + values[j]!;
  const out = new Float64Array(values.length);
  for (let j = half; j < values.length - half; j++) {
    out[j] = (sums[j + half + 1]! - sums[j - half]! - (values[j - half]! + values[j + half]!) / 2) / (2 * half);
  }
  return out;
}
