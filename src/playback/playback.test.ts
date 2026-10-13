import { describe, expect, it } from 'vitest';
import { countCells, countLabel, sampleName } from '../core/count';
import type { Bar, Chunk, TempoPoint } from '../core/model';
import { tempoLookup } from '../core/timing';
import { CountTimeline, type TimelineStep } from './count-timeline';
import type { TickRange } from '../core/plucks';
import {
  advanceChunk,
  chunkRange,
  completePass,
  endsSong,
  initialLoop,
  loopRange,
  nextChunk,
  nextRepeatMode,
  onLastChunk,
  passCounterText,
  passLabel,
  prevChunk,
  rangeAfterPass,
  restBars,
  restPlaces,
  selectChunk,
  selectPlace,
  setRepeatMode,
  songStart,
  validPlace,
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
  // A and B follow each other; the bass rests in bar 1, in bar 5 and from bar 7 to the end.
  const chunks: Chunk[] = [
    { id: 1, name: 'A', bars: [2, 3], position: 1, shifts: 0 },
    { id: 2, name: 'B', bars: [4, 4], position: 1, shifts: 0 },
    { id: 3, name: 'C', bars: [6, 6], position: 1, shifts: 0 },
  ];
  const [A, B, C] = chunks.map((c) => chunkRange(c, bars)) as [TickRange, TickRange, TickRange];
  const intro = { start: 0, end: 3840 };
  const gap = { start: 15360, end: 19200 };
  const tail = { start: 23040, end: 30720 };

  it('computes chunk tick ranges from bars', () => {
    expect(A).toEqual({ start: 3840, end: 11520 });
    expect(B).toEqual({ start: 11520, end: 15360 });
    expect(C).toEqual({ start: 19200, end: 23040 });
  });

  /** Plays `n` passes, each continuing where the loop decides (as the clocks do at the wrap). */
  function play(s: LoopState, n: number, tempo = 80): LoopState {
    for (let i = 0; i < n; i++) s = completePass(s, rangeAfterPass(s, chunks, bars), chunks, bars, tempo);
    return s;
  }

  describe('rests: the bars outside every chunk (ADR-0031)', () => {
    it('finds the rest before each chunk and the one after the last', () => {
      expect(restPlaces(chunks, bars.length)).toEqual([
        { chunkIndex: 0, rest: 'before', bars: [1, 1] },
        { chunkIndex: 2, rest: 'before', bars: [5, 5] },
        { chunkIndex: 2, rest: 'after', bars: [7, 8] },
      ]);
      expect(restBars(chunks, bars.length, 1, 'before')).toBeNull();
      expect(restPlaces([{ ...chunks[0]!, bars: [1, 8] }], bars.length)).toEqual([]);
    });

    it('gives the range of the chunk or of the rest next to it', () => {
      expect(loopRange({ chunkIndex: 0, rest: 'before' }, chunks, bars)).toEqual(intro);
      expect(loopRange({ chunkIndex: 0, rest: null }, chunks, bars)).toEqual(A);
      expect(loopRange({ chunkIndex: 2, rest: 'before' }, chunks, bars)).toEqual(gap);
      expect(loopRange({ chunkIndex: 2, rest: 'after' }, chunks, bars)).toEqual(tail);
    });

    it('starts a song at bar 1: in the rest when the bass enters later', () => {
      expect(songStart(chunks, bars.length)).toEqual({ chunkIndex: 0, rest: 'before' });
      expect(songStart(chunks.slice(1), bars.length)).toEqual({ chunkIndex: 0, rest: 'before' });
      expect(songStart([{ ...chunks[0]!, bars: [1, 3] }], bars.length)).toEqual({ chunkIndex: 0, rest: null });
    });

    it('drops a stored rest that the song does not have', () => {
      expect(validPlace({ chunkIndex: 2, rest: 'before' }, chunks, bars.length)).toEqual({ chunkIndex: 2, rest: 'before' });
      expect(validPlace({ chunkIndex: 2, rest: 'after' }, chunks, bars.length)).toEqual({ chunkIndex: 2, rest: 'after' });
      expect(validPlace({ chunkIndex: 1, rest: 'before' }, chunks, bars.length)).toEqual({ chunkIndex: 1, rest: null });
      // Only the last chunk has a rest after it; the one after B is the rest before C.
      expect(validPlace({ chunkIndex: 1, rest: 'after' }, chunks, bars.length)).toEqual({ chunkIndex: 1, rest: null });
    });

    it('plays a rest once and goes on into its chunk, in every mode, marking nothing', () => {
      for (const mode of ['advance', 'once', 'loop'] as const) {
        let s = selectPlace(initialLoop(3, mode), songStart(chunks, bars.length));
        expect(willAdvance(s, chunks.length)).toBe(true);
        expect(advanceChunk(s, chunks.length)).toBe(0);
        expect(rangeAfterPass(s, chunks, bars)).toEqual(A);
        s = completePass(s, A, chunks, bars, 80);
        expect(s).toMatchObject({ chunkIndex: 0, rest: null, pass: 1, done: {} });
      }
    });

    it('plays through the whole song without leaving a bar out', () => {
      let s = selectPlace(initialLoop(3, 'once'), songStart(chunks, bars.length));
      const heard: TickRange[] = [loopRange(s, chunks, bars)];
      for (let next = rangeAfterPass(s, chunks, bars); next; next = rangeAfterPass(s, chunks, bars)) {
        heard.push(next);
        s = completePass(s, next, chunks, bars, 80);
      }
      expect(heard).toEqual([intro, A, B, gap, C, tail]);
      for (let i = 1; i < heard.length; i++) expect(heard[i]!.start).toBe(heard[i - 1]!.end);
      expect(heard.at(-1)!.end).toBe(bars.at(-1)!.startTick + bars.at(-1)!.durTicks);
      // The song is over in the rest after the last chunk: it stays selected, and every chunk is done.
      expect(endsSong(s, chunks, bars.length)).toBe(true);
      s = completePass(s, null, chunks, bars, 80);
      expect(s).toMatchObject({ chunkIndex: 2, rest: 'after', pass: 1, done: { 0: 80, 1: 80, 2: 80 } });
    });

    it('goes through the rest when a chunk has had its passes', () => {
      let s = { ...selectChunk(initialLoop(2, 'advance'), 1, chunks.length), pass: 2 };
      expect(advanceChunk(s, chunks.length)).toBe(2); // the Next square looks past the rest
      expect(rangeAfterPass(s, chunks, bars)).toEqual(gap);
      s = completePass(s, gap, chunks, bars, 75);
      expect(s).toMatchObject({ chunkIndex: 2, rest: 'before', pass: 1, done: { 1: 75 } });
      s = play(s, 1);
      expect(s).toMatchObject({ chunkIndex: 2, rest: null, pass: 1, done: { 1: 75 } });
    });

    it('"Next chunk" and "previous chunk" leave a rest for the chunk after or before it', () => {
      const lead = selectPlace(initialLoop(3), { chunkIndex: 2, rest: 'before' });
      expect(nextChunk(lead, chunks.length)).toMatchObject({ chunkIndex: 2, rest: null });
      expect(prevChunk(lead, chunks.length)).toMatchObject({ chunkIndex: 1, rest: null });
      const end = selectPlace(initialLoop(3), { chunkIndex: 2, rest: 'after' });
      expect(prevChunk(end, chunks.length)).toMatchObject({ chunkIndex: 2, rest: null });
      const start = selectPlace(initialLoop(3), songStart(chunks, bars.length));
      expect(prevChunk(start, chunks.length)).toMatchObject({ chunkIndex: 0, rest: 'before' });
      expect(onLastChunk(lead, chunks.length)).toBe(false);
      expect(onLastChunk(end, chunks.length)).toBe(true);
      expect(onLastChunk({ chunkIndex: 2, rest: null }, chunks.length)).toBe(true);
    });
  });

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
      expect(advanceChunk(s, chunks.length)).toBe(1);
      expect(rangeAfterPass(s, chunks, bars)).toEqual(B);
      s = completePass(s, B, chunks, bars, 75);
      expect(s).toMatchObject({ chunkIndex: 1, rest: null, pass: 1, done: { 0: 75 } });
    });

    it('keeps looping the last chunk, marks it done and counts on past the target', () => {
      let s = selectChunk(initialLoop(1, 'advance'), 2, chunks.length);
      expect(willAdvance(s, chunks.length)).toBe(false);
      expect(advanceChunk(s, chunks.length)).toBeNull();
      s = play(s, 1, 90);
      expect(s).toMatchObject({ chunkIndex: 2, rest: null, pass: 2, done: { 2: 90 } });
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

    it('plays the rest after the last chunk, then stops', () => {
      let s = selectChunk(initialLoop(3, 'once'), 2, chunks.length);
      expect(willAdvance(s, chunks.length)).toBe(false);
      expect(endsSong(s, chunks, bars.length)).toBe(false);
      expect(rangeAfterPass(s, chunks, bars)).toEqual(tail);
      s = play(s, 1, 70);
      expect(s).toMatchObject({ chunkIndex: 2, rest: 'after', pass: 1, done: { 2: 70 } });
      expect(rangeAfterPass(s, chunks, bars)).toBeNull();
    });

    it('stops after a last chunk that ends the song and marks it done', () => {
      const whole = [chunks[0]!, { ...chunks[1]!, bars: [4, 8] as [number, number] }];
      let s = selectChunk(initialLoop(3, 'once'), 1, whole.length);
      expect(endsSong(s, whole, bars.length)).toBe(true);
      expect(rangeAfterPass(s, whole, bars)).toBeNull();
      s = completePass(s, null, whole, bars, 70);
      expect(s).toMatchObject({ chunkIndex: 1, rest: null, pass: 1, done: { 1: 70 } });
      expect(passLabel(s)).toBe('play through');
    });

    it('only play through ends the song', () => {
      for (const mode of ['advance', 'loop'] as const) {
        const s = { ...selectChunk(initialLoop(1, mode), 2, chunks.length), pass: 3 };
        expect(endsSong(s, chunks, bars.length)).toBe(false);
        expect(rangeAfterPass(s, chunks, bars)).toEqual(C);
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
      const s = play(selectChunk(initialLoop(2, 'loop'), 2, chunks.length), 3);
      expect(s).toMatchObject({ chunkIndex: 2, pass: 4, done: {} });
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
    expect(nextChunk(nextChunk(s, chunks.length), chunks.length).chunkIndex).toBe(2);
  });

  it('previous chunk restarts at pass 1 and stays on the first chunk', () => {
    const s = prevChunk({ ...initialLoop(3), chunkIndex: 1, pass: 3 }, chunks.length);
    expect(s).toMatchObject({ chunkIndex: 0, pass: 1, done: {} });
    expect(prevChunk(s, chunks.length).chunkIndex).toBe(0);
  });
});
