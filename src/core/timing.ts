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

/** Ticks in a bar of the given time signature. */
export function barTicks([num, den]: [number, number]): number {
  return (num * PPQ * 4) / den;
}
