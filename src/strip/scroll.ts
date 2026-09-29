// Scroll mapping for the strip (ADR-0017): "smoothed over 2 beats". alphaTab spaces notes by
// content, not time, so tick → x is piecewise linear between beat onsets; averaging that over a
// two-beat window keeps the speed continuous while notes stay within about 18 px of the playhead.

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
/** Largest distance (screen px) between a note and the playhead at its onset. */
export const MAX_ONSET_OFFSET = 10;

export const SMOOTH_WINDOW = 1920; // ticks: two quarter-note beats
const SAMPLES = 17;

/** Mean of the beat-onset interpolation over [tick − window/2, tick + window/2]. */
export function smoothedX(anchors: Anchor[], tick: number, window = SMOOTH_WINDOW): number {
  let sum = 0;
  for (let i = 0; i < SAMPLES; i++) sum += interpolate(anchors, tick + window * (i / (SAMPLES - 1) - 0.5));
  return sum / SAMPLES;
}

/**
 * The strip's x for a tick: the smoothed mapping, with its lead or lag behind the exact
 * note-to-note mapping softly limited to `maxOffset` (tanh, so the speed has no kinks). A note
 * is therefore on the playhead when it is plucked, its count sounds and it gets the ring.
 */
export function playheadX(anchors: Anchor[], tick: number, maxOffset: number): number {
  const exact = interpolate(anchors, tick);
  return exact + maxOffset * Math.tanh((smoothedX(anchors, tick) - exact) / maxOffset);
}
