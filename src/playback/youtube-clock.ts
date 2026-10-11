// YouTube source (ADR-0028): the recording on YouTube behind the PlaybackClock interface. The
// video does not follow the score's tempo map, so positions go through the song's sync map
// (src/core/sync.ts): video time ↔ score tick. This clock works in video time and converts at the
// edges.
//
// The player cannot loop a range, so the clock watches the range end on a timer, asks the loop
// controller where to continue shortly before it (ADR-0018) and seeks there when the end is heard,
// as the Music clock does (ADR-0022). What differs is how little the player tells:
//   - A started or moved video is heard again after about 50 ms, but the player reports "playing"
//     and a moving time only some 250 ms later. Until then the clock runs on the assumption that
//     the video started on time, and holds at the target when no report has come after 0.6 s.
//   - Right after a seek the player still reports the old position for a moment. Reports that do
//     not fit the seek are ignored, so a loop wrap is not counted twice.
//   - The video can be paused, started or stopped by a click on it. The clock follows and tells
//     the practice engine through `onExternal`.
//
// The player is a small port (`VideoPlayer`), implemented over the IFrame API in
// youtube-player.ts, so this module is unit tested with a fake.
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import { syncMap, type SyncAnchor, type SyncMap } from '../core/sync';
import { tempoLookup, type TempoLookup } from '../core/timing';
import type { PassCompleted, PlaybackClock, PlayOptions } from './clock';
import { countInPlan, NO_COUNT_IN, type CountInPort, type CountInState } from './count-in';
import type { Repeat } from './music-clock';

/** `idle`: never started. `buffering`: asked to play or moved, not heard yet as far as the player says. */
export type VideoState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended';

export interface VideoPlayer {
  /** Resolves once the video can be controlled; rejects when it cannot be shown. */
  readonly ready: Promise<void>;
  /** Moves to a video time in seconds. A video that is not playing stays paused there. */
  seek(seconds: number): void;
  /** Gets the video ready to start at a video time without a wait (it is buffered there, paused). */
  prepare(seconds: number): void;
  play(): void;
  pause(): void;
  /** The video time in seconds. Only to be trusted while `state()` is 'playing'. */
  time(): number;
  state(): VideoState;
  /** Asks for a playback rate (1 = as recorded); the player may choose another. */
  setRate(rate: number): void;
  /** The rate in use. */
  rate(): number;
  /** State changes, also those the user makes in the player itself. */
  onState(listener: (state: VideoState) => void): () => void;
  dispose(): void;
}

const START_LATENCY = 0.05; // seconds from a play or seek command until the video is heard there
const BLIND = 0.6; // seconds the clock runs on that assumption without a report from the player
const SETTLE = 1.5; // seconds after a seek in which reports far from its target are ignored
const SNAP = 0.25; // seconds of error taken over at once
const SMOOTH = 0.25; // seconds: time constant for correcting smaller errors
const GRACE_MS = 1000; // a pause or start this soon after our own command is not the user's
const LEAD_SECONDS = 0.25; // the next range is chosen this long before the range end
const WATCH_MS = 10; // range-end watch interval

const every: Repeat = (fn) => {
  const id = setInterval(fn, WATCH_MS);
  return () => clearInterval(id);
};

export class YouTubeClock implements PlaybackClock {
  readonly capabilities = { rates: 'continuous', video: true } as const;
  onRangeEnd: (range: TickRange) => TickRange | null = (range) => range;
  /** The video was started (true) or stopped (false) in the player itself, or it ended. */
  onExternal: (playing: boolean) => void = () => {};

  private readonly tempo: TempoLookup;
  private readonly sync: SyncMap;
  private readonly bars: Bar[];
  private readonly listeners = new Set<(e: PassCompleted) => void>();
  private readonly player: Promise<VideoPlayer>;
  private ready: VideoPlayer | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;

  private playing = false; // play() was called (the player may be loading, or the count-in running)
  private running = false; // the video has been started
  private token = 0;
  private rate = 1; // the rate asked for
  private pausedTick = 0;
  /** The video time `video` is heard at clock time `time` (ms); the position is extrapolated from here. */
  private anchor = { video: 0, time: 0 };
  /** A play or seek command whose effect the player has not reported yet. */
  private pending: { target: number; since: number } | null = null;
  private corrected = 0; // clock time of the last correction
  private commandAt = -Infinity; // clock time of our last play, pause or seek command
  private stopWatch: (() => void) | null = null;

  private range: TickRange = { start: 0, end: 0 };
  private rangeEnd = 0; // video time of the range end
  /** Where to continue after this pass, or 'stop'; chosen shortly before the range end. */
  private next: TickRange | 'stop' | null = null;

  constructor(
    song: { bars: Bar[]; tempoMap: TempoPoint[] },
    anchors: SyncAnchor[],
    player: Promise<VideoPlayer>,
    private readonly now: () => number = () => performance.now(),
    private readonly repeat: Repeat = every,
    private readonly countIn: CountInPort = NO_COUNT_IN,
  ) {
    this.tempo = tempoLookup(song.tempoMap, song.bars);
    this.sync = syncMap(anchors, song.bars, this.tempo);
    this.bars = song.bars;
    this.player = player.then(async (p) => {
      await p.ready;
      if (this.disposed) {
        p.dispose();
        throw new Error('disposed');
      }
      this.ready = p;
      this.unsubscribe = p.onState((state) => this.onState(state));
      p.setRate(this.rate);
      p.seek(this.videoSeconds(this.pausedTick));
      return p;
    });
    this.player.catch(() => undefined); // failures surface through play() and the engine
  }

  async play(options?: PlayOptions) {
    if (this.playing) return;
    this.playing = true;
    const token = ++this.token;
    if (options?.countIn) this.countIn.prepare();
    let player: VideoPlayer;
    try {
      player = await this.player;
    } catch {
      if (token === this.token) this.playing = false; // the engine reports the load error
      return;
    }
    if (token !== this.token || !this.playing || this.disposed) return;
    if (options?.countIn) {
      player.prepare(this.videoSeconds(this.pausedTick)); // buffers while the count-in plays
      const plan = countInPlan(this.bars, this.tempo, this.pausedTick, player.rate());
      // The video is started its start latency early, so it is heard on the count-in's last beat.
      const heard = await this.countIn.run({ ...plan, duration: Math.max(0, plan.duration - START_LATENCY) });
      if (!heard || token !== this.token || !this.playing || this.disposed) return;
    }
    this.next = null;
    this.running = true;
    this.stopWatch = this.repeat(() => this.watch());
    if (player.state() === 'playing') this.follow(player);
    else {
      this.expect(this.videoSeconds(this.pausedTick));
      player.play();
    }
  }

  pause() {
    if (!this.playing) return;
    this.token++;
    this.countIn.cancel();
    if (this.running) this.pausedTick = Math.max(this.range.start, Math.min(this.range.end - 1, this.getTick()));
    this.commandAt = this.now();
    this.ready?.pause(); // also ends the preparation for a count-in that was cancelled
    this.stopWatch?.();
    this.stopWatch = null;
    this.next = null;
    this.pending = null;
    this.running = false;
    this.playing = false;
  }

  isPlaying() {
    return this.playing;
  }

  seek(tick: number) {
    this.next = null;
    if (this.running) this.moveTo(tick);
    else {
      this.pausedTick = tick;
      this.ready?.seek(this.videoSeconds(tick)); // the paused video shows the place
    }
  }

  setRate(rate: number) {
    if (rate === this.rate) return;
    if (this.running) this.anchor = { video: this.position(), time: this.now() };
    this.rate = rate;
    this.ready?.setRate(rate);
  }

  setRange(range: TickRange) {
    if (range.start === this.range.start && range.end === this.range.end) return;
    const tick = this.getTick();
    const target = tick >= range.start && tick < range.end ? tick : range.start;
    this.range = range;
    this.rangeEnd = this.sync.secondsAt(range.end);
    this.next = null;
    if (this.running) {
      if (target !== tick) this.moveTo(target);
    } else if (target !== this.pausedTick) this.seek(target);
  }

  getTick() {
    if (!this.running) return this.pausedTick;
    // Held at the range start until the video passes it (a seek can land a little early).
    return Math.max(this.range.start, Math.min(this.sync.tickAt(this.position()), this.range.end - 1));
  }

  countInState(): CountInState | null {
    return this.playing && !this.running ? this.countIn.state() : null;
  }

  onPassCompleted(listener: (e: PassCompleted) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  dispose() {
    this.pause();
    this.disposed = true;
    this.countIn.dispose();
    this.listeners.clear();
    this.unsubscribe?.();
    this.ready?.dispose();
    this.ready = null;
  }

  // ------------------------------------------------------------------ position

  /** Video time of a tick; the video cannot be before its start. */
  private videoSeconds(tick: number) {
    return Math.max(0, this.sync.secondsAt(tick));
  }

  /** A command was sent: the video is expected to be heard at `seconds` after the start latency. */
  private expect(seconds: number) {
    const now = this.now();
    this.anchor = { video: seconds, time: now + START_LATENCY * 1000 };
    this.pending = { target: seconds, since: now };
    this.corrected = now; // the first report counts for the time that has passed since
    this.commandAt = now;
  }

  /** The video is already playing: take its time as it is. */
  private follow(player: VideoPlayer) {
    this.anchor = { video: player.time(), time: this.now() };
    this.pending = null;
    this.corrected = this.now();
  }

  private moveTo(tick: number) {
    const seconds = this.videoSeconds(tick);
    this.ready!.seek(seconds);
    this.expect(seconds);
  }

  /** The video time heard now: extrapolated, and corrected toward the player's time while it plays. */
  private position(): number {
    const now = this.now();
    const player = this.ready!;
    const rate = player.rate();
    const predicted = this.anchor.video + (Math.max(0, now - this.anchor.time) / 1000) * rate;

    if (player.state() !== 'playing') {
      // No word from the player yet: run on, but only for a moment.
      if (this.pending && now - this.pending.since < BLIND * 1000) return predicted;
      this.anchor = { video: this.pending?.target ?? this.anchor.video, time: now }; // stalled: hold
      return this.anchor.video;
    }

    const reported = player.time();
    if (this.pending) {
      const elapsed = (now - this.pending.since) / 1000;
      const fits = reported >= this.pending.target - SNAP && reported <= this.pending.target + elapsed * rate + SNAP;
      if (!fits && elapsed < SETTLE) return predicted; // still the time from before the command
      this.pending = null;
    }
    const error = reported - predicted;
    const share = Math.abs(error) > SNAP ? 1 : 1 - Math.exp(-(now - this.corrected) / (SMOOTH * 1000));
    this.anchor = { video: predicted + share * error, time: now };
    this.corrected = now;
    return this.anchor.video;
  }

  // ------------------------------------------------------------------ loop

  /** Runs on a timer while playing: chooses the next range ahead of time and wraps at the end. */
  private watch() {
    if (!this.running) return;
    const player = this.ready!;
    const state = player.state();
    if ((state === 'paused' || state === 'ended') && this.now() - this.commandAt > GRACE_MS) {
      this.stopped(); // paused by a click on the video, or the video is over
      return;
    }
    const video = this.position();
    if (!this.next && video >= this.rangeEnd - LEAD_SECONDS * player.rate()) this.next = this.onRangeEnd(this.range) ?? 'stop';
    if (video >= this.rangeEnd) this.wrap();
  }

  private wrap() {
    const next = this.next ?? this.onRangeEnd(this.range) ?? 'stop';
    const from = this.range;
    if (next === 'stop') {
      this.pause();
      this.seek(from.start);
      for (const l of this.listeners) l({ from, to: null });
      return;
    }
    const to = next.start === from.start && next.end === from.end ? from : next;
    this.next = null;
    this.range = to;
    this.rangeEnd = this.sync.secondsAt(to.end);
    // A chunk that continues where this one ends needs no seek (no gap in the video).
    if (to.start !== from.end) this.moveTo(to.start);
    for (const l of this.listeners) l({ from, to });
  }

  // ------------------------------------------------------------------ the user's clicks on the video

  private onState(state: VideoState) {
    if (state !== 'playing' || this.playing || this.disposed) return;
    if (this.now() - this.commandAt <= GRACE_MS) return; // the tail of our own commands
    // Started in the player: play on from where the video is, without a count-in.
    this.playing = true;
    this.token++;
    this.next = null;
    this.running = true;
    this.stopWatch = this.repeat(() => this.watch());
    this.follow(this.ready!);
    this.onExternal(true);
  }

  private stopped() {
    this.pause();
    this.onExternal(false);
  }
}
