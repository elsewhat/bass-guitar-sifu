import { describe, expect, it } from 'vitest';
import { countCells, countLabel, sampleName } from '../core/count';
import type { Bar, Chunk, TempoPoint } from '../core/model';
import { tempoLookup } from '../core/timing';
import { CountTimeline, type TimelineStep } from './count-timeline';
import {
  chunkRange,
  completePass,
  endsSong,
  initialLoop,
  nextChunk,
  nextRepeatMode,
  passCounterText,
  passLabel,
  prevChunk,
  rangeAfterPass,
  selectChunk,
  setRepeatMode,
  willAdvance,
  type LoopState,
} from './loop';

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

  it('inverts secondsAt across tempo changes', () => {
    const map: TempoPoint[] = [
      { bar: 1, tick: 0, bpm: 120 },
      { bar: 2, tick: 1920, bpm: 77 },
      { bar: 4, tick: 0, bpm: 124 },
    ];
    const t = tempoLookup(map, bars44);
    for (const tick of [0, 100, 3840, 5759, 5760, 9000, 11520, 20000]) {
      expect(t.tickAt(t.secondsAt(tick))).toBeCloseTo(tick, 6);
    }
    expect(t.tickAt(0.5)).toBeCloseTo(960);
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

  it('ends at the range end when onRangeEnd returns null and schedules nothing after it', () => {
    let asked = 0;
    const tl = new CountTimeline(bars44, tempoLookup(tempo120, bars44), () => (asked++, null));
    tl.start(3840, 0, range, 1);
    const steps = tl.fill(3);
    expect(steps.at(-1)).toEqual({ kind: 'end', time: 2, from: range });
    expect(steps.filter((s) => s.kind === 'count')).toHaveLength(8);
    expect(tl.fill(5)).toEqual([]);
    expect(asked).toBe(1);
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

  /** Plays `n` passes, each continuing where the loop decides (as the clocks do at the wrap). */
  function play(s: LoopState, n: number, tempo = 80): LoopState {
    for (let i = 0; i < n; i++) s = completePass(s, rangeAfterPass(s, chunks, bars), chunks, bars, tempo);
    return s;
  }

  describe('advance: each chunk `passes` times, then the next', () => {
    it('loops the chunk until the last pass, then advances and marks it done', () => {
      let s = initialLoop(3, 'advance');
      expect(rangeAfterPass(s, chunks, bars)).toEqual(A);
      s = completePass(s, A, chunks, bars, 75);
      s = completePass(s, A, chunks, bars, 75);
      expect(s.pass).toBe(3);
      expect(passLabel(s)).toBe('pass 3 of 3');
      expect(passCounterText(s)).toBe('3/3');
      expect(willAdvance(s, chunks.length)).toBe(true);
      expect(rangeAfterPass(s, chunks, bars)).toEqual(B);
      s = completePass(s, B, chunks, bars, 75);
      expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: { 0: 75 } });
    });

    it('keeps looping the last chunk, marks it done and counts on past the target', () => {
      let s = selectChunk(initialLoop(1, 'advance'), 1, chunks.length);
      expect(willAdvance(s, chunks.length)).toBe(false);
      s = play(s, 1, 90);
      expect(s).toMatchObject({ chunkIndex: 1, pass: 2, done: { 1: 90 } });
      expect(passLabel(s)).toBe('pass 2');
      expect(passCounterText(s)).toBe('2');
    });
  });

  describe('once (play through): every chunk once', () => {
    it('moves on after a single pass and marks the chunk done at the tempo used', () => {
      let s = initialLoop(3, 'once');
      expect(willAdvance(s, chunks.length)).toBe(true);
      expect(rangeAfterPass(s, chunks, bars)).toEqual(B);
      s = play(s, 1, 85);
      expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: { 0: 85 } });
      expect(passLabel(s)).toBe('play through');
      expect(passCounterText(s)).toBe('Play through');
    });

    it('stops after the last chunk and marks it done', () => {
      let s = selectChunk(initialLoop(3, 'once'), 1, chunks.length);
      expect(willAdvance(s, chunks.length)).toBe(false);
      expect(endsSong(s, chunks.length)).toBe(true);
      expect(rangeAfterPass(s, chunks, bars)).toBeNull();
      s = completePass(s, null, chunks, bars, 70);
      expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: { 1: 70 } });
      expect(passLabel(s)).toBe('play through');
    });

    it('only play through ends the song', () => {
      for (const mode of ['advance', 'loop'] as const) {
        const s = { ...selectChunk(initialLoop(1, mode), 1, chunks.length), pass: 3 };
        expect(endsSong(s, chunks.length)).toBe(false);
        expect(rangeAfterPass(s, chunks, bars)).toEqual(B);
      }
    });
  });

  describe('loop: the chunk until the player moves on', () => {
    it('repeats indefinitely without marking anything done', () => {
      const s = play(initialLoop(2, 'loop'), 4);
      expect(s).toMatchObject({ chunkIndex: 0, pass: 5, done: {} });
      expect(willAdvance(s, chunks.length)).toBe(false);
      expect(passLabel(s)).toBe('pass 5 · looping');
      expect(passCounterText(s)).toBe('Pass 5');
    });

    it('repeats the last chunk without marking it done', () => {
      const s = play(selectChunk(initialLoop(2, 'loop'), 1, chunks.length), 3);
      expect(s).toMatchObject({ chunkIndex: 1, pass: 4, done: {} });
    });
  });

  it('plays through by default', () => {
    expect(initialLoop(3).repeatMode).toBe('once');
  });

  it('cycles advance → once → loop and resets the pass count on a change', () => {
    expect(nextRepeatMode('advance')).toBe('once');
    expect(nextRepeatMode('once')).toBe('loop');
    expect(nextRepeatMode('loop')).toBe('advance');
    const looping = play(initialLoop(3, 'loop'), 4);
    const s = setRepeatMode(looping, 'advance');
    expect(s).toMatchObject({ chunkIndex: 0, pass: 1, repeatMode: 'advance' });
    // The pass count starts over, so the chunk is not left straight away.
    expect(rangeAfterPass(s, chunks, bars)).toEqual(A);
  });

  it('"Next chunk" and selection restart at pass 1 without marking done', () => {
    let s = { ...initialLoop(3), pass: 2 };
    s = nextChunk(s, chunks.length);
    expect(s).toMatchObject({ chunkIndex: 1, pass: 1, done: {} });
    expect(nextChunk(s, chunks.length).chunkIndex).toBe(1);
  });

  it('previous chunk restarts at pass 1 and stays on the first chunk', () => {
    const s = prevChunk({ ...initialLoop(3), chunkIndex: 1, pass: 3 }, chunks.length);
    expect(s).toMatchObject({ chunkIndex: 0, pass: 1, done: {} });
    expect(prevChunk(s, chunks.length).chunkIndex).toBe(0);
  });
});
