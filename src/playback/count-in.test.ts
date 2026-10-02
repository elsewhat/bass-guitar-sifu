import { describe, expect, it } from 'vitest';
import type { Bar, TempoPoint } from '../core/model';
import { tempoLookup } from '../core/timing';
import { countInPlan, countInState } from './count-in';

// Bars 1–2 in 4/4 (3840 ticks), bar 3 in 6/8 (2880), bar 4 in 2/2 (3840); 120 bpm: 0.5 s per quarter.
const bars: Bar[] = [
  { n: 1, time: [4, 4], startTick: 0, durTicks: 3840, section: null },
  { n: 2, time: [4, 4], startTick: 3840, durTicks: 3840, section: null },
  { n: 3, time: [6, 8], startTick: 7680, durTicks: 2880, section: null },
  { n: 4, time: [2, 2], startTick: 10560, durTicks: 3840, section: null },
];
const tempoMap: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }];
const tempo = tempoLookup(tempoMap, bars);
const beats = (plan: ReturnType<typeof countInPlan>) => plan.beats.map((b) => `${b.label}@${b.offset}`);

describe('countInPlan', () => {
  it('counts one bar of beats into a bar start', () => {
    const plan = countInPlan(bars, tempo, 3840, 1);
    expect(plan.duration).toBe(2);
    expect(plan.time).toEqual([4, 4]);
    expect(beats(plan)).toEqual(['1@0', '2@0.5', '3@1', '4@1.5']);
  });

  it('follows the tempo setting', () => {
    const plan = countInPlan(bars, tempo, 0, 0.5);
    expect(plan.duration).toBe(4);
    expect(beats(plan)).toEqual(['1@0', '2@1', '3@2', '4@3']);
  });

  it('ends on the start position: from beat 3 it counts 3 4 1 2', () => {
    const plan = countInPlan(bars, tempo, 3840 + 2 * 960, 1);
    expect(plan.duration).toBe(2);
    expect(beats(plan)).toEqual(['3@0', '4@0.5', '1@1', '2@1.5']);
  });

  it('counts on the grid when started off it', () => {
    const plan = countInPlan(bars, tempo, 480 + 240, 1); // an eighth and a sixteenth into bar 1
    expect(beats(plan)).toEqual(['2@0.125', '3@0.625', '4@1.125', '1@1.625']);
  });

  it('uses the meter of the bar playback starts in', () => {
    expect(beats(countInPlan(bars, tempo, 7680, 1))).toEqual(['1@0', '2@0.25', '3@0.5', '4@0.75', '5@1', '6@1.25']);
    const half = countInPlan(bars, tempo, 10560, 1);
    expect(half.duration).toBe(2);
    expect(beats(half)).toEqual(['1@0', '2@1']); // x/2: beats only, no "&"
  });
});

describe('countInState', () => {
  it('lights the eighth being counted, wrapping into the start bar', () => {
    const plan = countInPlan(bars, tempo, 3840 + 2 * 960, 1); // from beat 3
    expect(countInState(plan, 0)).toEqual({ time: [4, 4], cell: 4 }); // "3"
    expect(countInState(plan, 0.3)).toEqual({ time: [4, 4], cell: 5 }); // "&"
    expect(countInState(plan, 1.1)).toEqual({ time: [4, 4], cell: 0 }); // "1"
    expect(countInState(plan, 1.99).cell).toBe(3); // "2 &"
    expect(countInState(plan, -1).cell).toBe(4);
  });
});
