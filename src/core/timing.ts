import type { Bar, TempoPoint } from './model';
import { PPQ } from './model';

interface AbsTempo {
  tick: number; // absolute
  bpm: number;
}

function absoluteTempo(tempoMap: TempoPoint[], bars: Bar[]): AbsTempo[] {
  return tempoMap
    .map((t) => ({ tick: (bars[t.bar - 1]?.startTick ?? 0) + t.tick, bpm: t.bpm }))
    .sort((a, b) => a.tick - b.tick);
}

/** Seconds from the start of the score to an absolute tick, following the tempo map. */
export function tickToSeconds(tick: number, tempoMap: TempoPoint[], bars: Bar[]): number {
  const map = absoluteTempo(tempoMap, bars);
  let sec = 0;
  let at = 0;
  let bpm = map[0]?.bpm ?? 120;
  for (const t of map) {
    if (t.tick >= tick) break;
    sec += ((t.tick - at) / PPQ) * (60 / bpm);
    at = t.tick;
    bpm = t.bpm;
  }
  return sec + ((tick - at) / PPQ) * (60 / bpm);
}

/** Tempo (quarter-note BPM) in effect at an absolute tick. */
export function bpmAt(tick: number, tempoMap: TempoPoint[], bars: Bar[]): number {
  let bpm = tempoMap[0]?.bpm ?? 120;
  for (const t of absoluteTempo(tempoMap, bars)) {
    if (t.tick > tick) break;
    bpm = t.bpm;
  }
  return bpm;
}

export function scoreDurationSeconds(tempoMap: TempoPoint[], bars: Bar[]): number {
  const last = bars[bars.length - 1];
  return last ? tickToSeconds(last.startTick + last.durTicks, tempoMap, bars) : 0;
}

/**
 * Tempo map prepared for per-frame lookups (binary search instead of a scan per call).
 * `secondsAt` is the score time of an absolute tick at 100 % speed.
 */
export interface TempoLookup {
  bpmAt(tick: number): number;
  secondsAt(tick: number): number;
}

export function tempoLookup(tempoMap: TempoPoint[], bars: Bar[]): TempoLookup {
  const points = absoluteTempo(tempoMap, bars);
  if (!points.length || points[0]!.tick > 0) points.unshift({ tick: 0, bpm: points[0]?.bpm ?? 120 });
  const seconds: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    seconds.push(seconds[i - 1]! + ((points[i]!.tick - p.tick) / PPQ) * (60 / p.bpm));
  }
  const indexAt = (tick: number) => {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (points[mid]!.tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    bpmAt: (tick) => points[indexAt(tick)]!.bpm,
    secondsAt: (tick) => {
      const i = indexAt(tick);
      const p = points[i]!;
      return seconds[i]! + ((tick - p.tick) / PPQ) * (60 / p.bpm);
    },
  };
}

/** Index of the bar that contains an absolute tick (clamped to the first and last bar). */
export function barIndexAt(bars: Bar[], tick: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid]!.startTick <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Ticks in a bar of the given time signature. */
export function barTicks([num, den]: [number, number]): number {
  return (num * PPQ * 4) / den;
}
