import { describe, expect, it } from 'vitest';
import type { Bar, TempoPoint } from './model';
import { syncMap, syncProblems } from './sync';
import { tempoLookup } from './timing';

// 4/4 bars of 3840 ticks at 120 bpm: 2 s per bar, 1920 ticks per second.
const bars: Bar[] = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, time: [4, 4], startTick: i * 3840, durTicks: 3840, section: null }));
const steady = tempoLookup([{ bar: 1, tick: 0, bpm: 120 }], bars);

describe('syncMap', () => {
  it('is the score time without anchors', () => {
    const map = syncMap([], bars, steady);
    expect(map.secondsAt(3840)).toBeCloseTo(2);
    expect(map.tickAt(2)).toBeCloseTo(3840);
  });

  it('shifts the whole score with one anchor (the recording starts later)', () => {
    const map = syncMap([{ bar: 1, ms: 1500 }], bars, steady);
    expect(map.secondsAt(0)).toBeCloseTo(1.5);
    expect(map.secondsAt(2 * 3840)).toBeCloseTo(5.5);
    expect(map.tickAt(5.5)).toBeCloseTo(2 * 3840);
    expect(map.tickAt(0.5)).toBeCloseTo(-1920); // before the music starts
  });

  it('follows a recording that is faster or slower than the score between anchors', () => {
    // Bars 1–2 take 3 s in the recording (score: 4 s), bars 3–4 take 6 s.
    const map = syncMap([{ bar: 1, ms: 1000 }, { bar: 3, ms: 4000 }, { bar: 5, ms: 10_000 }], bars, steady);
    expect(map.secondsAt(3840)).toBeCloseTo(2.5); // bar 2: halfway through the first stretch
    expect(map.secondsAt(3 * 3840)).toBeCloseTo(7); // bar 4: halfway through the second
    expect(map.tickAt(2.5)).toBeCloseTo(3840);
    expect(map.tickAt(8.5)).toBeCloseTo(3.5 * 3840);
    // After the last anchor the recording runs at the score's tempo.
    expect(map.secondsAt(6 * 3840)).toBeCloseTo(14);
    expect(map.tickAt(14)).toBeCloseTo(6 * 3840);
  });

  it('takes an anchor inside a bar', () => {
    const map = syncMap([{ bar: 2, tick: 1920, ms: 9000 }], bars, steady);
    expect(map.secondsAt(3840 + 1920)).toBeCloseTo(9);
    expect(map.secondsAt(3840)).toBeCloseTo(8);
  });

  it('keeps the shape of a tempo change between two anchors', () => {
    // Bar 2 is at 60 bpm (4 s); bars 1–2 take 6 s of score time and 3 s in the recording.
    const tempoMap: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }, { bar: 2, tick: 0, bpm: 60 }, { bar: 3, tick: 0, bpm: 120 }];
    const map = syncMap([{ bar: 1, ms: 0 }, { bar: 3, ms: 3000 }], bars, tempoLookup(tempoMap, bars));
    expect(map.secondsAt(3840)).toBeCloseTo(1); // a third of the score time, a third of the stretch
    expect(map.tickAt(2)).toBeCloseTo(3840 + 1920);
  });

  it('is its own inverse along a whole song', () => {
    const map = syncMap([{ bar: 1, ms: 420 }, { bar: 2, ms: 2390 }, { bar: 3, ms: 4480 }, { bar: 6, ms: 10_100 }], bars, steady);
    for (let tick = -960; tick < 9 * 3840; tick += 777) expect(map.tickAt(map.secondsAt(tick))).toBeCloseTo(tick, 5);
  });

  it('skips anchors that go backwards or point outside the score', () => {
    const map = syncMap([{ bar: 1, ms: 1000 }, { bar: 2, ms: 900 }, { bar: 99, ms: 5000 }, { bar: 3, ms: 5000 }], bars, steady);
    expect(map.secondsAt(3840)).toBeCloseTo(3);
  });
});

describe('syncProblems', () => {
  it('accepts anchors that move forward', () => {
    expect(syncProblems([{ bar: 1, ms: 0 }, { bar: 1, tick: 960, ms: 400 }, { bar: 4, ms: 6100 }], bars)).toEqual([]);
  });

  it('reports bars and ticks outside the score and anchors that do not move forward', () => {
    expect(syncProblems([{ bar: 9, ms: 0 }], bars)).toEqual(['sync anchor bar 9: the score has 8 bars']);
    expect(syncProblems([{ bar: 1, tick: 3840, ms: 0 }], bars)[0]).toMatch(/3840 ticks long/);
    expect(syncProblems([{ bar: 2, ms: 100 }, { bar: 2, ms: 200 }], bars)[0]).toMatch(/not after the anchor before it/);
    expect(syncProblems([{ bar: 2, ms: 300 }, { bar: 3, ms: 300 }], bars)[0]).toMatch(/300 ms is not after/);
  });
});
