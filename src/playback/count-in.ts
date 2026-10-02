// Count-in (ADR-0025): one bar of metronome counts before playback starts, whenever Play is
// pressed or the chunk is changed while playing. Passes and auto-advance continue without one.
// The counted bar has the meter and tempo of the bar playback starts in, and ends exactly where
// playback starts, so from mid-bar it counts "3 4 1 2" into beat 3. Only the beats are sounded;
// the count cells light every eighth. Pure time math, shared by every source.
import { countLabel, EIGHTH } from '../core/count';
import type { Bar } from '../core/model';
import { barIndexAt, barTicks, type TempoLookup } from '../core/timing';

export interface CountInPlan {
  /** Meter of the counted bar. */
  time: [number, number];
  /** Seconds from the first count-in moment to the start of playback. */
  duration: number;
  /** The sounded counts, in order: seconds after the count-in starts. */
  beats: { label: string; offset: number }[];
  /** Position in the bar (ticks) where the count-in starts: the start tick's position. */
  phase: number;
  barTicks: number;
  ticksPerSecond: number;
}

/** What the count cells show during a count-in: the meter and the eighth being counted. */
export interface CountInState {
  time: [number, number];
  cell: number;
}

/** The count-in before playback starts at `tick`, at `rate` × the score tempo. */
export function countInPlan(bars: Bar[], tempo: TempoLookup, tick: number, rate: number): CountInPlan {
  const bar = bars[barIndexAt(bars, tick)]!;
  const length = barTicks(bar.time);
  const phase = Math.max(0, Math.min(length, tick - bar.startTick)) % length;
  const ticksPerSecond = (tempo.bpmAt(tick) / 60) * EIGHTH * 2 * rate;
  const beats: CountInPlan['beats'] = [];
  const eighths = Math.ceil(length / EIGHTH);
  for (let k = 0; k < eighths; k++) {
    const label = countLabel(bar.time, k);
    if (label === null || label === '&') continue;
    const ahead = (k * EIGHTH - phase + length) % length; // ticks from the count-in start
    beats.push({ label, offset: ahead / ticksPerSecond });
  }
  beats.sort((a, b) => a.offset - b.offset);
  return { time: bar.time, duration: length / ticksPerSecond, beats, phase, barTicks: length, ticksPerSecond };
}

/** The count cell (eighth of the bar) heard `elapsed` seconds into the count-in. */
export function countInState(plan: CountInPlan, elapsed: number): CountInState {
  const into = Math.max(0, Math.min(plan.duration, elapsed)) * plan.ticksPerSecond;
  const pos = (plan.phase + into) % plan.barTicks;
  return { time: plan.time, cell: Math.floor(pos / EIGHTH) };
}

/**
 * Plays count-ins for the sources that are not the metronome (Synth, Music); implemented over Web
 * Audio in count-in-player.ts, faked in the clock tests.
 */
export interface CountInPort {
  /** Unlocks audio; called synchronously from the user gesture that starts playback. */
  prepare(): void;
  /** Plays the count-in; resolves true when it has been played to the end, false when cancelled. */
  run(plan: CountInPlan): Promise<boolean>;
  cancel(): void;
  /** The count heard now, or null when not counting in. */
  state(): CountInState | null;
  dispose(): void;
}

/** No count-in: playback starts at once. */
export const NO_COUNT_IN: CountInPort = {
  prepare() {},
  run: () => Promise.resolve(true),
  cancel() {},
  state: () => null,
  dispose() {},
};
