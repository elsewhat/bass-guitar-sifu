import { describe, expect, it } from 'vitest';
import { countCells, countLabel, sampleName } from '../core/count';
import type { Bar, Chunk, TempoPoint } from '../core/model';
import { tempoLookup } from '../core/timing';
import { CountTimeline, type TimelineStep } from './count-timeline';
import { chunkRange, completePass, initialLoop, nextChunk, passLabel, rangeAfterPass, selectChunk, willAdvance } from './loop';

function makeBars(times: [number, number][]): Bar[] {
  let start = 0;
  return times.map((time, i) => {
    const dur = (time[0] * 3840) / time[1];
    const bar = { n: i + 1, time, startTick: start, durTicks: dur, section: null };
    start += dur;
    return bar;
  });
}

const bars44 = makeBars(Array.from({ length: 8 }, () => [4, 4] as [number, number]));
const tempo120: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }];

describe('count labels', () => {
  it('counts eighths in 4/4 as 1 & 2 & 3 & 4 &', () => {
    expect(countCells([4, 4])).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
  });

  it('counts every eighth as a beat in x/8', () => {
    expect(countCells([6, 8])).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('says only beats and "&" in x/2', () => {
    expect(countCells([2, 2])).toEqual(['1', null, '&', null, '2', null, '&', null]);
    expect(countLabel([2, 4], 3)).toBe('&');
  });

  it('maps labels to sample names', () => {
    expect(sampleName('1')).toBe('one');
    expect(sampleName('&')).toBe('and');
    expect(sampleName('9')).toBe('nine');
  });
});

describe('tempoLookup', () => {
  it('matches a tempo change mid-song', () => {
    const t = tempoLookup([{ bar: 1, tick: 0, bpm: 120 }, { bar: 2, tick: 0, bpm: 60 }], bars44);
    expect(t.bpmAt(3839)).toBe(120);
    expect(t.bpmAt(3840)).toBe(60);
    expect(t.secondsAt(3840)).toBeCloseTo(2);
    expect(t.secondsAt(3840 + 960)).toBeCloseTo(3);
  });
});

describe('CountTimeline', () => {
  const range = { start: 3840, end: 7680 }; // bar 2

  it('schedules one count per eighth at the tempo and rate', () => {
    const tl = new CountTimeline(bars44, tempoLookup(tempo120, bars44));
    tl.start(3840, 10, range, 1);
    const steps = tl.fill(11);
    expect(steps.map((s) => (s.kind === 'count' ? s.label : 'wrap'))).toEqual(['1', '&', '2', '&']);
    expect(steps.map((s) => s.time)).toEqual([10, 10.25, 10.5, 10.75]);

    const half = new CountTimeline(bars44, tempoLookup(tempo120, bars44));
    half.start(3840, 0, range, 0.5);
    expect(half.fill(1).map((s) => s.time)).toEqual([0, 0.5]);
  });

  it('wraps at the range end to the range chosen by onRangeEnd', () => {
    const next = { start: 11520, end: 15360 }; // bar 4
    const tl = new CountTimeline(bars44, tempoLookup(tempo120, bars44), () => next);
    tl.start(3840, 0, range, 1);
    const steps = tl.fill(2.3);
    const wrap = steps.find((s): s is Extract<TimelineStep, { kind: 'wrap' }> => s.kind === 'wrap')!;
    expect(wrap.time).toBe(2);
    expect(wrap.to).toEqual(next);
    const after = steps[steps.indexOf(wrap) + 1]!;
    expect(after).toMatchObject({ kind: 'count', tick: 11520, bar: 4, label: '1', time: 2 });
    expect(tl.currentRange).toEqual(next);
  });

  it('starts from the next grid point when resumed between eighths', () => {
    const tl = new CountTimeline(bars44, tempoLookup(tempo120, bars44));
    tl.start(3840 + 100, 0, range, 1);
    const first = tl.fill(0.3)[0]!;
    expect(first).toMatchObject({ tick: 3840 + 480, label: '&' });
    expect(first.time).toBeCloseTo((380 / 960) * 0.5);
  });

  it('reports the audible position between and after steps', () => {
    const tl = new CountTimeline(bars44, tempoLookup(tempo120, bars44));
    tl.start(3840, 5, range, 1);
    expect(tl.positionAt(4.9)).toBe(3840); // before the first sound
    tl.fill(6);
    expect(tl.positionAt(5.125)).toBeCloseTo(3840 + 240);
    expect(tl.positionAt(5.5)).toBeCloseTo(3840 + 960);
    tl.prune(5.5);
    expect(tl.positionAt(5.6)).toBeCloseTo(3840 + 960 + 192);
  });

  it('follows meter changes on the grid', () => {
    const bars = makeBars([[2, 4], [6, 8]]);
    const tl = new CountTimeline(bars, tempoLookup(tempo120, bars));
    tl.start(0, 0, { start: 0, end: 1920 + 2880 }, 1);
    const labels = tl.fill(10).filter((s) => s.kind === 'count').slice(0, 10).map((s) => (s.kind === 'count' ? s.label : ''));
    expect(labels).toEqual(['1', '&', '2', '&', '1', '2', '3', '4', '5', '6']);
  });
});

describe('loop controller', () => {
  const bars = bars44;
  const chunks: Chunk[] = [
    { id: 1, name: 'A', bars: [1, 2], position: 1, shifts: 0 },
    { id: 2, name: 'B', bars: [4, 4], position: 1, shifts: 0 },
  ];
  const A = chunkRange(chunks[0]!, bars);
  const B = chunkRange(chunks[1]!, bars);

  it('computes chunk tick ranges from bars', () => {
    expect(A).toEqual({ start: 0, end: 7680 });
    expect(B).toEqual({ start: 11520, end: 15360 });
  });

  it('loops the chunk until the last pass, then advances and marks it done', () => {
    let s = initialLoop(3);
    expect(rangeAfterPass(s, chunks, bars)).toEqual(A);
    s = completePass(s, A, chunks, bars, 75);
    s = completePass(s, A, chunks, bars, 75);
    expect(s.pass).toBe(3);
    expect(willAdvance(s, chunks.length)).toBe(true);
    expect(rangeAfterPass(s, chunks, bars)).toEqual(B);
    s = completePass(s, B, chunks, bars, 75);
    expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: { 0: 75 } });
  });

  it('repeats indefinitely with auto-advance off', () => {
    let s = { ...initialLoop(2), autoAdvance: false };
    for (let i = 0; i < 4; i++) s = completePass(s, rangeAfterPass(s, chunks, bars), chunks, bars, 80);
    expect(s).toMatchObject({ chunkIndex: 0, pass: 5, done: {} });
    expect(passLabel(s)).toBe('pass 5');
  });

  it('keeps looping the last chunk and marks it done', () => {
    let s = selectChunk(initialLoop(1), 1, chunks.length);
    expect(willAdvance(s, chunks.length)).toBe(false);
    s = completePass(s, rangeAfterPass(s, chunks, bars), chunks, bars, 90);
    expect(s).toMatchObject({ chunkIndex: 1, pass: 2, done: { 1: 90 } });
  });

  it('"Next chunk" and selection restart at pass 1 without marking done', () => {
    let s = { ...initialLoop(3), pass: 2 };
    s = nextChunk(s, chunks.length);
    expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: {} });
    expect(nextChunk(s, chunks.length).chunkIndex).toBe(1);
    expect(passLabel({ pass: 2, passes: 3 })).toBe('pass 2 of 3');
  });
});
