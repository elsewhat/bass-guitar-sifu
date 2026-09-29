import { describe, expect, it } from 'vitest';
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import type { PassCompleted } from './clock';
import { SynthClock, type SynthPlayer } from './synth-clock';
import { trackPlayback } from './synth-mix';

// 4/4 bars of 3840 ticks at 120 bpm: 1920 ticks per second at 100 %.
const bars: Bar[] = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, time: [4, 4], startTick: i * 3840, durTicks: 3840, section: null }));
const tempoMap: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }];
const song = { bars, tempoMap };
const chunkA: TickRange = { start: 0, end: 2 * 3840 }; // bars 1–2
const chunkB: TickRange = { start: 2 * 3840, end: 4 * 3840 }; // bars 3–4, right after A
const chunkC: TickRange = { start: 8 * 3840, end: 10 * 3840 }; // bars 9–10, after a gap

class FakePlayer implements SynthPlayer {
  calls: string[] = [];
  range: TickRange | null = null;
  private position = new Set<(tick: number, isSeek: boolean) => void>();
  private wrap = new Set<() => void>();
  private resolve!: () => void;
  readonly ready = new Promise<void>((r) => (this.resolve = r));

  load() {
    this.resolve();
  }
  play() {
    this.calls.push('play');
  }
  pause() {
    this.calls.push('pause');
  }
  seek(tick: number) {
    this.calls.push(`seek ${tick}`);
  }
  setSpeed(rate: number) {
    this.calls.push(`speed ${rate}`);
  }
  setRange(range: TickRange) {
    this.range = range;
    this.calls.push(`range ${range.start}-${range.end}`);
  }
  onPosition(l: (tick: number, isSeek: boolean) => void) {
    this.position.add(l);
    return () => void this.position.delete(l);
  }
  onWrap(l: () => void) {
    this.wrap.add(l);
    return () => void this.wrap.delete(l);
  }
  dispose() {
    this.calls.push('dispose');
  }
  report(tick: number, isSeek = false) {
    for (const l of this.position) l(tick, isSeek);
  }
  wrapped() {
    for (const l of this.wrap) l();
  }
}

async function setup(range = chunkA) {
  let now = 0;
  const player = new FakePlayer();
  const clock = new SynthClock(song, Promise.resolve(player), () => now);
  const passes: PassCompleted[] = [];
  clock.onPassCompleted((e) => passes.push(e));
  clock.setRange(range);
  clock.seek(range.start);
  player.load();
  await clock.play();
  player.calls = [];
  return {
    player,
    clock,
    passes,
    /** Moves time on by `ms` and reports the position the player would have reached. */
    at(ms: number, tick?: number) {
      now = ms;
      if (tick !== undefined) player.report(tick);
    },
  };
}

describe('SynthClock position', () => {
  it('extrapolates between reports at the score tempo and rate', async () => {
    const { clock, at } = await setup();
    at(500);
    expect(clock.getTick()).toBeCloseTo(960);
    clock.setRate(0.5);
    at(1500);
    expect(clock.getTick()).toBeCloseTo(960 + 960);
  });

  it('corrects 20 % toward a report and snaps on a large error', async () => {
    const { clock, at } = await setup();
    at(500, 1060); // predicted 960, reported 100 ticks later
    expect(clock.getTick()).toBeCloseTo(980);
    at(600, 3000); // more than a quarter away
    expect(clock.getTick()).toBe(3000);
  });

  it('never runs past the range end before the wrap', async () => {
    const { clock, at } = await setup();
    at(10_000);
    expect(clock.getTick()).toBe(chunkA.end - 1);
  });

  it('waits for the player before playing and keeps the paused position', async () => {
    const player = new FakePlayer();
    const clock = new SynthClock(song, Promise.resolve(player), () => 0);
    clock.setRange(chunkA);
    clock.seek(1000);
    const started = clock.play();
    expect(clock.isPlaying()).toBe(true);
    expect(clock.getTick()).toBe(1000);
    expect(player.calls).not.toContain('play');
    player.load();
    await started;
    expect(player.calls.slice(-2)).toEqual(['seek 1000', 'play']);
  });

  it('does not start when paused while loading', async () => {
    const player = new FakePlayer();
    const clock = new SynthClock(song, Promise.resolve(player), () => 0);
    const started = clock.play();
    clock.pause();
    player.load();
    await started;
    expect(player.calls).not.toContain('play');
    expect(clock.isPlaying()).toBe(false);
  });
});

describe('SynthClock loop', () => {
  it('asks for the next range shortly before the end and counts a pass at the wrap', async () => {
    const { clock, player, passes, at } = await setup();
    const asked: TickRange[] = [];
    clock.onRangeEnd = (r) => (asked.push(r), r);
    at(3000, 5760); // 1.0 s before the end
    expect(asked).toEqual([]);
    at(3800, 7296); // 0.2 s before the end
    expect(asked).toEqual([chunkA]);
    player.wrapped();
    expect(passes).toEqual([{ from: chunkA, to: chunkA }]);
    expect(clock.getTick()).toBe(0);
    expect(player.calls).toEqual([]); // alphaTab loops by itself
  });

  it.each([
    ['right after the chunk', chunkB],
    ['after a gap', chunkC],
  ])('moves to a next chunk %s at the wrap', async (_, next) => {
    const { clock, player, passes, at } = await setup();
    clock.onRangeEnd = () => next;
    at(3800, 7296);
    expect(player.range).toEqual(chunkA); // changing it now would seek
    player.wrapped();
    expect(passes).toEqual([{ from: chunkA, to: next }]);
    expect(player.calls).toEqual([`range ${next.start}-${next.end}`]);
    expect(clock.getTick()).toBe(next.start);
  });

  it('asks for the range at the wrap when no report came near the end', async () => {
    const { clock, player, passes } = await setup();
    clock.onRangeEnd = () => chunkB;
    player.wrapped();
    expect(passes).toEqual([{ from: chunkA, to: chunkB }]);
  });

  it('treats a missed wrap event as a wrap when the position drops', async () => {
    const { clock, passes, at } = await setup();
    clock.onRangeEnd = (r) => r;
    at(3800, 7296);
    at(4100, 200);
    expect(passes).toEqual([{ from: chunkA, to: chunkA }]);
  });

  it('asks again after the user seeks', async () => {
    const { clock, at } = await setup();
    let asked = 0;
    clock.onRangeEnd = (r) => (asked++, r);
    at(3800, 7296);
    clock.seek(7000);
    at(3900, 7300);
    expect(asked).toBe(2);
  });

  it('keeps the position when a new range contains it', async () => {
    const { clock, player, at } = await setup();
    at(500);
    clock.setRange({ start: 0, end: 4 * 3840 });
    expect(player.calls).toEqual(['range 0-15360', 'seek 960']);
    expect(clock.getTick()).toBe(960);
  });

  it('moves to a new range and its start when the position is outside it', async () => {
    const { clock, player, at } = await setup();
    at(500);
    clock.setRange(chunkC);
    expect(player.calls).toEqual([`range ${chunkC.start}-${chunkC.end}`]); // the player moves to its start
    expect(clock.getTick()).toBe(chunkC.start);
  });
});

describe('trackPlayback', () => {
  it('solos the bass, plays everything, or mutes the bass', () => {
    expect(trackPlayback('bass', 4, 2)).toEqual({ solo: [2], mute: [] });
    expect(trackPlayback('band', 4, 2)).toEqual({ solo: [], mute: [] });
    expect(trackPlayback('backing', 4, 2)).toEqual({ solo: [], mute: [2] });
  });
});
