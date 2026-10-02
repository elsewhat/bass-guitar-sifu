import { describe, expect, it } from 'vitest';
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import type { PassCompleted } from './clock';
import { FakeCountIn } from './count-in.fake';
import { MusicClock, type MusicPlayer } from './music-clock';

// 4/4 bars of 3840 ticks at 120 bpm: 1920 ticks per second, 2 s per bar. The file has a 500 ms lead-in.
const bars: Bar[] = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, time: [4, 4], startTick: i * 3840, durTicks: 3840, section: null }));
const tempoMap: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }];
const song = { bars, tempoMap };
const OFFSET_MS = 500;
const chunkA: TickRange = { start: 0, end: 2 * 3840 }; // bars 1–2, file 0.5–4.5 s
const chunkB: TickRange = { start: 2 * 3840, end: 4 * 3840 }; // bars 3–4, right after A
const chunkC: TickRange = { start: 8 * 3840, end: 10 * 3840 }; // bars 9–10, after a gap

class FakePlayer implements MusicPlayer {
  calls: string[] = [];
  seconds = 0;
  private resolve!: () => void;
  readonly ready = new Promise<void>((r) => (this.resolve = r));

  load() {
    this.resolve();
  }
  async play() {
    this.calls.push('play');
  }
  pause() {
    this.calls.push('pause');
  }
  seek(seconds: number) {
    this.seconds = seconds;
    this.calls.push(`seek ${seconds}`);
  }
  time() {
    return this.seconds;
  }
  dispose() {
    this.calls.push('dispose');
  }
}

async function setup(range = chunkA) {
  let now = 0;
  let watch = () => {};
  const player = new FakePlayer();
  const clock = new MusicClock(song, OFFSET_MS, Promise.resolve(player), () => now, (fn) => ((watch = fn), () => (watch = () => {})));
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
    /** Moves time on by `ms`, optionally with the file time the player reports, and runs the watch timer. */
    at(ms: number, seconds?: number) {
      now = ms;
      if (seconds !== undefined) player.seconds = seconds;
      watch();
    },
  };
}

describe('MusicClock position', () => {
  it('seeks to the file time of the start tick, lead-in included', async () => {
    const player = new FakePlayer();
    const clock = new MusicClock(song, OFFSET_MS, Promise.resolve(player), () => 0, () => () => {});
    clock.setRange(chunkB);
    clock.seek(chunkB.start + 960);
    player.load();
    await clock.play();
    expect(player.calls).toEqual(['seek 5', 'play']); // bar 3 beat 2 = 4.5 s + 0.5 s lead-in
    expect(clock.capabilities.rates).toEqual([1]);
  });

  it('extrapolates between reports and ignores rate changes', async () => {
    const { clock, at } = await setup();
    clock.setRate(0.5);
    at(500);
    expect(clock.getTick()).toBeCloseTo(960);
  });

  it('corrects 20 % toward a report and snaps on a large error', async () => {
    const { clock, at } = await setup();
    at(500, 0.5 + (960 + 100) / 1920); // predicted 960, reported 100 ticks later
    expect(clock.getTick()).toBeCloseTo(980);
    at(600, 0.5 + 3000 / 1920); // more than a quarter away
    expect(clock.getTick()).toBeCloseTo(3000);
  });

  it('never runs past the range end before the wrap', async () => {
    const { clock, at } = await setup();
    at(3_900);
    expect(clock.getTick()).toBeLessThanOrEqual(chunkA.end - 1);
  });

  it('does not start when paused while loading', async () => {
    const player = new FakePlayer();
    const clock = new MusicClock(song, OFFSET_MS, Promise.resolve(player), () => 0, () => () => {});
    const started = clock.play();
    clock.pause();
    player.load();
    await started;
    expect(player.calls).not.toContain('play');
    expect(clock.isPlaying()).toBe(false);
  });

  it('keeps the position when the new range contains it, else moves to its start', async () => {
    const { clock, player, at } = await setup();
    at(1000);
    clock.setRange({ start: 0, end: 4 * 3840 });
    expect(player.calls).toEqual([]);
    clock.setRange(chunkC);
    expect(player.calls).toEqual(['seek 16.5']);
    expect(clock.getTick()).toBe(chunkC.start);
  });
});

describe('MusicClock loop', () => {
  it('asks for the next range shortly before the end and seeks back at the wrap', async () => {
    const { clock, player, passes, at } = await setup();
    const asked: TickRange[] = [];
    clock.onRangeEnd = (r) => (asked.push(r), r);
    at(3_000);
    expect(asked).toEqual([]);
    at(3_800); // 0.2 s before the end
    expect(asked).toEqual([chunkA]);
    at(4_000);
    expect(passes).toEqual([{ from: chunkA, to: chunkA }]);
    expect(player.calls).toEqual(['seek 0.5']);
    expect(clock.getTick()).toBeCloseTo(0);
    expect(asked).toHaveLength(1);
  });

  it('continues into an adjacent chunk without seeking', async () => {
    const { clock, player, passes, at } = await setup();
    clock.onRangeEnd = () => chunkB;
    at(4_000);
    expect(passes).toEqual([{ from: chunkA, to: chunkB }]);
    expect(player.calls).toEqual([]);
    at(5_000);
    expect(clock.getTick()).toBeCloseTo(chunkB.start + 1920);
  });

  it('jumps over a gap to a later chunk', async () => {
    const { clock, player, passes, at } = await setup();
    clock.onRangeEnd = () => chunkC;
    at(4_000);
    expect(passes).toEqual([{ from: chunkA, to: chunkC }]);
    expect(player.calls).toEqual(['seek 16.5']);
    expect(clock.getTick()).toBe(chunkC.start);
  });

  it('forgets the chosen range after a seek', async () => {
    const { clock, at } = await setup();
    let asks = 0;
    clock.onRangeEnd = (r) => (asks++, r);
    at(3_800);
    clock.seek(0);
    at(7_800);
    expect(asks).toBe(2);
  });

  it('counts in at full speed, then seeks and plays (ADR-0025)', async () => {
    const player = new FakePlayer();
    const countIn = new FakeCountIn();
    const clock = new MusicClock(song, OFFSET_MS, Promise.resolve(player), () => 0, () => () => {}, countIn);
    clock.setRange(chunkB);
    clock.setRate(0.5); // ignored: Music plays at 100 %
    player.load();
    const started = clock.play({ countIn: true });
    await countIn.running;
    expect(countIn.calls).toEqual(['prepare', 'run 2s']);
    expect(player.calls).toEqual([]);
    countIn.finish();
    await started;
    expect(player.calls).toEqual(['seek 4.5', 'play']);
  });
});
