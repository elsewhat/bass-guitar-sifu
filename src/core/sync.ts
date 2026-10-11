// Sync map for a recording (ADR-0028): score position ↔ recording time, from the sidecar's anchors
// (`media.youtube.sync`). A recording never follows the score's tempo map exactly, so an anchor
// says "this bar starts here in the recording". Between two anchors the recording time is
// interpolated linearly over score time, so tempo changes inside the stretch keep their shape;
// before the first and after the last anchor the recording is taken to run at the score's tempo.
// Without anchors the recording time is the score time.
import type { Bar } from './model';
import type { TempoLookup } from './timing';

export interface SyncAnchor {
  bar: number; // 1-based (a played bar, ADR-0023)
  tick?: number; // offset from the bar start
  ms: number; // recording time
}

export interface SyncMap {
  /** Recording time in seconds of an absolute tick. */
  secondsAt(tick: number): number;
  /** Inverse of `secondsAt`: the absolute tick heard at a recording time. */
  tickAt(seconds: number): number;
}

interface Point {
  score: number; // seconds of score time at 100 %
  video: number; // seconds of recording time
}

/** Absolute tick of an anchor, or null when its bar does not exist. */
function anchorTick(anchor: SyncAnchor, bars: Bar[]): number | null {
  const bar = bars[anchor.bar - 1];
  return bar ? bar.startTick + (anchor.tick ?? 0) : null;
}

/**
 * What is wrong with a list of anchors, as messages for the build: a bar or tick outside the
 * score, or anchors that do not move forward in both the score and the recording.
 */
export function syncProblems(anchors: SyncAnchor[], bars: Bar[]): string[] {
  const problems: string[] = [];
  let prev: { tick: number; ms: number } | null = null;
  for (const a of anchors) {
    const at = `sync anchor bar ${a.bar}${a.tick ? ` tick ${a.tick}` : ''}`;
    const bar = bars[a.bar - 1];
    const tick = anchorTick(a, bars);
    if (!bar || tick === null) {
      problems.push(`${at}: the score has ${bars.length} bars`);
      continue;
    }
    if ((a.tick ?? 0) >= bar.durTicks) problems.push(`${at}: the bar is ${bar.durTicks} ticks long`);
    if (prev && tick <= prev.tick) problems.push(`${at} is not after the anchor before it`);
    if (prev && a.ms <= prev.ms) problems.push(`${at}: ${a.ms} ms is not after the anchor before it (${prev.ms} ms)`);
    prev = { tick, ms: a.ms };
  }
  return problems;
}

export function syncMap(anchors: SyncAnchor[], bars: Bar[], tempo: TempoLookup): SyncMap {
  const points: Point[] = [];
  for (const a of anchors) {
    const tick = anchorTick(a, bars);
    if (tick === null) continue;
    const point = { score: tempo.secondsAt(tick), video: a.ms / 1000 };
    const last = points[points.length - 1];
    // The build rejects anchors that go backwards; a stale one is skipped rather than followed.
    if (!last || (point.score > last.score && point.video > last.video)) points.push(point);
  }
  if (!points.length) points.push({ score: 0, video: 0 });

  /** Index of the last point at or before `value` on one axis (0 when it lies before them all). */
  const indexAt = (value: number, axis: keyof Point) => {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (points[mid]![axis] <= value) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const convert = (value: number, from: keyof Point, to: keyof Point) => {
    const i = indexAt(value, from);
    const a = points[i]!;
    const b = points[i + 1];
    if (!b || value < a[from]) return a[to] + (value - a[from]); // outside the anchors: score tempo
    return a[to] + ((value - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  };

  return {
    secondsAt: (tick) => convert(tempo.secondsAt(tick), 'score', 'video'),
    tickAt: (seconds) => tempo.tickAt(convert(seconds, 'video', 'score')),
  };
}
