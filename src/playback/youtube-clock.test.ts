import { describe, expect, it } from 'vitest';
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import type { SyncAnchor } from '../core/sync';
import type { PassCompleted } from './clock';
import { FakeCountIn } from './count-in.fake';
import { YouTubeClock, type VideoPlayer, type VideoState } from './youtube-clock';

// 4/4 bars of 3840 ticks at 120 bpm: 2 s of score per bar. The recording starts 1 s into the video
// and plays every bar in 1.6 s (faster than the score), so bar n starts at 1 + 1.6 (n − 1) s.
const bars: Bar[] = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, time: [4, 4], startTick: i * 3840, durTicks: 3840, section: null }));
const tempoMap: TempoPoint[] = [{ bar: 1, tick: 0, bpm: 120 }];
const song = { bars, tempoMap };
const anchors: SyncAnchor[] = bars.map((b) => ({ bar: b.n, ms: 1000 + (b.n - 1) * 1600 }));
const TICKS_PER_VIDEO_SECOND = 3840 / 1.6;
const chunkA: TickRange = { start: 0, end: 2 * 3840 }; // bars 1–2, video 1.0–4.2 s
const chunkB: TickRange = { start: 2 * 3840, end: 4 * 3840 }; // bars 3–4, right after A
const chunkC: TickRange = { start: 8 * 3840, end: 10 * 3840 }; // bars 9–10, video 13.8–17.0 s

/** Like the IFrame player: while it plays, its time runs on between reports at its rate. */
class FakePlayer implements VideoPlayer {
  calls: string[] = [];
  current: VideoState = 'idle';
  speed = 1;
  private seconds = 0;
  private reportedAt = 0;
  private resolve!: () => void;
  private readonly listeners = new Set<(state: VideoState) => void>();
  readonly ready = new Promise<void>((r) => (this.resolve = r));

  constructor(private readonly now: () => number = () => 0) {}

  load() {
    this.resolve();
  }
  /** The player reports a state, as after a command or a click on the video. */
  report(state: VideoState, seconds = this.time()) {
    this.seconds = seconds;
    this.reportedAt = this.now();
    this.current = state;
    for (const l of this.listeners) l(state);
  }
  seek(seconds: number) {
    this.calls.push(`seek ${Math.round(seconds * 1000) / 1000}`);
  }
  prepare(seconds: number) {
    this.calls.push(`prepare ${Math.round(seconds * 1000) / 1000}`);
  }
  play() {
    this.calls.push('play');
  }
  pause() {
    this.calls.push('pause');
  }
  time() {
    return this.seconds + (this.current === 'playing' ? ((this.now() - this.reportedAt) / 1000) * this.speed : 0);
  }
  state() {
    return this.current;
  }
  setRate(rate: number) {
    this.calls.push(`rate ${rate}`);
    this.speed = rate;
  }
  rate() {
    return this.speed;
  }
  onState(listener: (state: VideoState) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  dispose() {
    this.calls.push('dispose');
  }
}

function create(range = chunkA) {
  const time = { now: 0 };
  let watch = () => {};
  const player = new FakePlayer(() => time.now);
  const clock = new YouTubeClock(song, anchors, Promise.resolve(player), () => time.now, (fn) => ((watch = fn), () => (watch = () => {})));
  const passes: PassCompleted[] = [];
  const external: boolean[] = [];
  clock.onPassCompleted((e) => passes.push(e));
  clock.onExternal = (playing) => external.push(playing);
  clock.setRange(range);
  clock.seek(range.start);
  return {
    player,
    clock,
    passes,
    external,
    /** Moves the clock time to `ms` and runs the watch timer. */
    at(ms: number) {
      time.now = ms;
      watch();
    },
    /** The player reports that it plays at a video time, at clock time `ms`. */
    playingAt(ms: number, seconds: number) {
      time.now = ms;
      player.report('playing', seconds);
      watch();
    },
  };
}

/** A clock that plays chunk A, with the player reporting from 300 ms on (the video started at once). */
async function playing(range = chunkA) {
  const t = create(range);
  t.player.load();
  await t.clock.play();
  t.player.calls = [];
  const start = 1 + (range.start / 3840) * 1.6;
  t.player.report('buffering');
  t.playingAt(300, start + 0.25);
  return { ...t, start };
}

describe('YouTubeClock position', () => {
  it('puts the paused video at the start of the range and plays from there', async () => {
    const { clock, player } = create(chunkB);
    player.load();
    await clock.play();
    expect(player.calls).toEqual(['rate 1', 'seek 4.2', 'play']); // bar 3 in the recording
    expect(clock.capabilities).toEqual({ rates: 'continuous', video: true });
    expect(clock.isPlaying()).toBe(true);
  });

  it('runs on for a moment before the player reports, then follows the reported time', async () => {
    const { clock, player, at, playingAt } = create();
    player.load();
    await clock.play();
    player.report('buffering');
    at(40);
    expect(clock.getTick()).toBe(0); // not heard yet
    at(250); // 200 ms after the assumed start
    expect(clock.getTick()).toBeCloseTo(0.2 * TICKS_PER_VIDEO_SECOND);
    playingAt(300, 1.26); // the player says 10 ms more than assumed
    expect(clock.getTick()).toBeGreaterThan(0.25 * TICKS_PER_VIDEO_SECOND);
    expect(clock.getTick()).toBeLessThan(0.26 * TICKS_PER_VIDEO_SECOND);
  });

  it('holds at the start when the video has not started after 0.6 s, and goes on when it does', async () => {
    const { clock, player, at, playingAt } = create();
    player.load();
    await clock.play();
    player.report('buffering');
    at(500);
    expect(clock.getTick()).toBeGreaterThan(0);
    at(700);
    expect(clock.getTick()).toBe(0);
    at(3000);
    expect(clock.getTick()).toBe(0);
    playingAt(3100, 1.05);
    at(3200);
    expect(clock.getTick()).toBeCloseTo(0.15 * TICKS_PER_VIDEO_SECOND, -1);
  });

  it('converts through the sync map: the tick follows the recording, not the score tempo', async () => {
    const { clock, at } = await playing();
    at(1650); // 1.6 s of video after the start: bar 2 in the recording, 2 s of score
    expect(clock.getTick()).toBeCloseTo(3840, -1);
  });

  it('holds while the video buffers in the middle and never runs past the range end', async () => {
    const { clock, player, at, playingAt } = await playing();
    playingAt(1000, 1.95);
    const before = clock.getTick();
    player.report('buffering');
    at(1800);
    expect(clock.getTick()).toBeCloseTo(before, -1);
    player.report('playing', 9); // far past the end, before the watch timer has wrapped
    expect(clock.getTick()).toBe(chunkA.end - 1);
  });

  it('uses the rate the player reports', async () => {
    const { clock, player, at } = await playing();
    clock.setRate(0.5);
    expect(player.calls).toEqual(['rate 0.5']);
    player.speed = 0.75; // the player took another rate
    const tick = clock.getTick();
    at(700);
    expect(clock.getTick() - tick).toBeCloseTo(0.75 * 0.4 * TICKS_PER_VIDEO_SECOND, -1);
  });

  it('moves the paused video when a chunk is chosen, and keeps the place inside a wider range', async () => {
    const { clock, player } = create();
    player.load();
    await Promise.resolve();
    await Promise.resolve();
    player.calls = [];
    clock.setRange(chunkC);
    expect(player.calls).toEqual(['seek 13.8']);
    expect(clock.getTick()).toBe(chunkC.start);
    clock.seek(chunkC.start + 3840);
    expect(player.calls).toEqual(['seek 13.8', 'seek 15.4']);
    clock.setRange({ start: chunkC.start, end: 12 * 3840 });
    expect(player.calls).toHaveLength(2);
  });

  it('does not start when paused while loading', async () => {
    const { clock, player } = create();
    const started = clock.play();
    clock.pause();
    player.load();
    await started;
    expect(player.calls).not.toContain('play');
    expect(clock.isPlaying()).toBe(false);
  });
});

describe('YouTubeClock loop', () => {
  it('asks for the next range shortly before the end and seeks back when the end is heard', async () => {
    const { clock, player, passes, playingAt } = await playing();
    const asked: TickRange[] = [];
    clock.onRangeEnd = (r) => (asked.push(r), r);
    playingAt(2800, 3.8);
    expect(asked).toEqual([]);
    playingAt(3000, 4.0); // 0.2 s before the end at 4.2 s
    expect(asked).toEqual([chunkA]);
    playingAt(3200, 4.21);
    expect(passes).toEqual([{ from: chunkA, to: chunkA }]);
    expect(player.calls).toEqual(['seek 1']);
    expect(clock.getTick()).toBe(0);
    expect(asked).toHaveLength(1);
  });

  it('ignores the old position the player still reports right after the seek', async () => {
    const { clock, passes, at, playingAt } = await playing();
    playingAt(3200, 4.21); // wrap
    playingAt(3210, 4.22); // the player has not caught up with the seek
    playingAt(3220, 4.23);
    expect(passes).toHaveLength(1);
    expect(clock.getTick()).toBe(0);
    at(3300); // 100 ms after the seek: taken to be playing again for 50 ms
    expect(clock.getTick()).toBeCloseTo(0.05 * TICKS_PER_VIDEO_SECOND);
    playingAt(3500, 1.24); // the player's word: 10 ms behind the assumption
    expect(clock.getTick()).toBeGreaterThan(0.24 * TICKS_PER_VIDEO_SECOND);
    expect(clock.getTick()).toBeLessThan(0.25 * TICKS_PER_VIDEO_SECOND);
    expect(passes).toHaveLength(1);
  });

  it('believes the player again when its reports never fit the seek', async () => {
    const { clock, at, playingAt } = await playing();
    clock.seek(3840); // bar 2, 2.6 s, at clock time 300
    playingAt(400, 3.4); // not where the seek went: for 1.5 s the clock keeps to its own count
    expect(clock.getTick()).toBeCloseTo(3840 + 0.05 * TICKS_PER_VIDEO_SECOND);
    playingAt(2000, 3.9);
    at(2010);
    expect(clock.getTick()).toBeCloseTo((3.91 - 1) * TICKS_PER_VIDEO_SECOND, -1);
  });

  it('continues into an adjacent chunk without seeking', async () => {
    const { clock, player, passes, playingAt } = await playing();
    clock.onRangeEnd = () => chunkB;
    playingAt(3200, 4.21);
    expect(passes).toEqual([{ from: chunkA, to: chunkB }]);
    expect(player.calls).toEqual([]);
    playingAt(4000, 5.0);
    expect(clock.getTick()).toBeCloseTo(chunkB.start + 0.8 * TICKS_PER_VIDEO_SECOND, -1);
  });

  it('jumps over a gap to a later chunk', async () => {
    const { clock, player, passes, playingAt } = await playing();
    clock.onRangeEnd = () => chunkC;
    playingAt(3200, 4.21);
    expect(passes).toEqual([{ from: chunkA, to: chunkC }]);
    expect(player.calls).toEqual(['seek 13.8']);
    expect(clock.getTick()).toBe(chunkC.start);
  });

  it('pauses at the end of the song and puts the video back at the chunk start', async () => {
    const { clock, player, passes, at, playingAt } = await playing();
    clock.onRangeEnd = () => null;
    playingAt(3000, 4.0);
    expect(clock.isPlaying()).toBe(true);
    playingAt(3200, 4.21);
    expect(passes).toEqual([{ from: chunkA, to: null }]);
    expect(clock.isPlaying()).toBe(false);
    expect(clock.getTick()).toBe(chunkA.start);
    expect(player.calls).toEqual(['pause', 'seek 1']);
    at(5000);
    expect(passes).toHaveLength(1);
  });

  it('forgets the chosen range after a seek', async () => {
    const { clock, playingAt } = await playing();
    let asks = 0;
    clock.onRangeEnd = (r) => (asks++, r);
    playingAt(3000, 4.0);
    clock.seek(0);
    playingAt(3400, 1.3);
    playingAt(6100, 4.0);
    expect(asks).toBe(2);
  });

  it('prepares the video during the count-in and starts it at the end (ADR-0025)', async () => {
    const time = { now: 0 };
    const player = new FakePlayer();
    const countIn = new FakeCountIn();
    const clock = new YouTubeClock(song, anchors, Promise.resolve(player), () => time.now, () => () => {}, countIn);
    clock.setRange(chunkB);
    clock.setRate(0.5);
    player.load();
    const started = clock.play({ countIn: true });
    await countIn.running;
    expect(countIn.calls).toEqual(['prepare', 'run 3.95s']); // one bar at half speed, less the start latency
    expect(player.calls).toEqual(['rate 0.5', 'seek 4.2', 'prepare 4.2']);
    expect(clock.getTick()).toBe(chunkB.start);
    expect(clock.countInState()).not.toBeNull();
    countIn.finish();
    await started;
    expect(player.calls.at(-1)).toBe('play');
    expect(clock.countInState()).toBeNull();
  });

  it('stops the prepared video when the count-in is cancelled', async () => {
    const player = new FakePlayer();
    const countIn = new FakeCountIn();
    const clock = new YouTubeClock(song, anchors, Promise.resolve(player), () => 0, () => () => {}, countIn);
    clock.setRange(chunkA);
    player.load();
    const started = clock.play({ countIn: true });
    await countIn.running;
    clock.pause();
    await started;
    expect(player.calls).toEqual(['rate 1', 'seek 1', 'prepare 1', 'pause']);
    expect(clock.isPlaying()).toBe(false);
  });
});

describe('YouTubeClock and clicks on the video', () => {
  it('pauses when the video is paused in the player, and says so', async () => {
    const { clock, player, external, at, playingAt } = await playing();
    playingAt(2000, 2.95);
    player.report('paused');
    at(2010);
    expect(clock.isPlaying()).toBe(false);
    expect(external).toEqual([false]);
    expect(clock.getTick()).toBeCloseTo(1.95 * TICKS_PER_VIDEO_SECOND, -2);
  });

  it('does not take the pause before its own start for a click', async () => {
    const { clock, player, external, at } = create();
    player.load();
    player.current = 'paused';
    await clock.play();
    at(500); // still paused half a second after the command: the player is slow
    expect(clock.isPlaying()).toBe(true);
    at(1200);
    expect(clock.isPlaying()).toBe(false); // it never started
    expect(external).toEqual([false]);
  });

  it('plays on from where the video is when it is started in the player', async () => {
    const { clock, player, external, at, playingAt } = create();
    player.load();
    await Promise.resolve();
    await Promise.resolve();
    at(5000);
    playingAt(5010, 1.8); // a click on the video
    expect(clock.isPlaying()).toBe(true);
    expect(external).toEqual([true]);
    expect(player.calls).not.toContain('play');
    at(5110);
    expect(clock.getTick()).toBeCloseTo(0.9 * TICKS_PER_VIDEO_SECOND, -1);
  });

  it('ignores the tail of its own pause', async () => {
    const { clock, external, playingAt } = await playing();
    clock.pause();
    playingAt(350, 1.3); // a late "playing" from before the pause
    expect(clock.isPlaying()).toBe(false);
    expect(external).toEqual([]);
  });

  it('stops when the video ends before the range does', async () => {
    const { clock, player, external, at, playingAt } = await playing();
    playingAt(2000, 2.95);
    player.report('ended');
    at(2010);
    expect(clock.isPlaying()).toBe(false);
    expect(external).toEqual([false]);
  });

  it('disposes the player and stops listening', async () => {
    const { clock, player, external, playingAt } = await playing();
    clock.dispose();
    expect(player.calls).toEqual(['pause', 'dispose']);
    playingAt(9000, 2);
    expect(external).toEqual([]);
  });
});
