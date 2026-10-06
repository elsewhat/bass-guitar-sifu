// Music source (ADR-0022): an MP3 rendered from the transcription, so file time follows the
// score's tempo map after a lead-in offset measured at intake (`media.music.offsetMs`). It plays at
// 100 % only. The audio element reports its time coarsely, so the position is extrapolated per
// animation frame and corrected toward each new report, as in the Synth clock (ADR-0019). The
// element cannot loop a range, so this clock watches the range end on a timer, asks the loop
// controller where to continue shortly before it (ADR-0018) and seeks there when the end is heard,
// or pauses there at the end of the song.
//
// The player is a small port (`MusicPlayer`), implemented over <audio> in music-player.ts, so this
// module is unit tested with a fake.
import type { Bar, TempoPoint } from '../core/model';
import { PPQ } from '../core/model';
import type { TickRange } from '../core/plucks';
import { tempoLookup, type TempoLookup } from '../core/timing';
import type { PassCompleted, PlaybackClock, PlayOptions } from './clock';
import { countInPlan, NO_COUNT_IN, type CountInPort, type CountInState } from './count-in';

export interface MusicPlayer {
  play(): Promise<void>;
  pause(): void;
  /** Moves to a file time in seconds. */
  seek(seconds: number): void;
  /** The audible file time in seconds (output latency removed); updated coarsely. */
  time(): number;
  /** Resolves once enough of the file is loaded to start. */
  readonly ready: Promise<void>;
  dispose(): void;
}

/** Runs `fn` repeatedly until the returned function is called. */
export type Repeat = (fn: () => void) => () => void;

const QUARTER = PPQ;
const CORRECTION = 0.2; // share of the error corrected per report
const LEAD_SECONDS = 0.25; // the next range is chosen this long before the range end
const WATCH_MS = 10; // range-end watch interval

const every: Repeat = (fn) => {
  const id = setInterval(fn, WATCH_MS);
  return () => clearInterval(id);
};

export class MusicClock implements PlaybackClock {
  readonly capabilities = { rates: [1], video: false };
  onRangeEnd: (range: TickRange) => TickRange | null = (range) => range;

  private readonly tempo: TempoLookup;
  private readonly bars: Bar[];
  private readonly offset: number; // seconds of audio before the score's first tick
  private readonly listeners = new Set<(e: PassCompleted) => void>();
  private readonly player: Promise<MusicPlayer>;
  private ready: MusicPlayer | null = null;
  private disposed = false;

  private playing = false; // play() was called (the player may still be loading)
  private running = false; // the player is playing
  private token = 0;
  private pausedTick = 0;
  private anchor = { tick: 0, time: 0 };
  private reported = Number.NaN; // the last file time read from the player
  private stopWatch: (() => void) | null = null;

  private range: TickRange = { start: 0, end: 0 };
  /** Where to continue after this pass, or 'stop'; chosen shortly before the range end. */
  private next: TickRange | 'stop' | null = null;

  constructor(
    song: { bars: Bar[]; tempoMap: TempoPoint[] },
    offsetMs: number,
    player: Promise<MusicPlayer>,
    private readonly now: () => number = () => performance.now(),
    private readonly repeat: Repeat = every,
    private readonly countIn: CountInPort = NO_COUNT_IN,
  ) {
    this.tempo = tempoLookup(song.tempoMap, song.bars);
    this.bars = song.bars;
    this.offset = offsetMs / 1000;
    this.player = player.then(async (p) => {
      await p.ready;
      if (this.disposed) {
        p.dispose();
        throw new Error('disposed');
      }
      this.ready = p;
      return p;
    });
    this.player.catch(() => undefined); // failures surface through play() and the engine
  }

  async play(options?: PlayOptions) {
    if (this.playing) return;
    this.playing = true;
    const token = ++this.token;
    if (options?.countIn) this.countIn.prepare();
    let player: MusicPlayer;
    try {
      player = await this.player;
    } catch {
      if (token === this.token) this.playing = false; // the engine reports the load error
      return;
    }
    if (token !== this.token || !this.playing || this.disposed) return;
    if (options?.countIn) {
      const heard = await this.countIn.run(countInPlan(this.bars, this.tempo, this.pausedTick, 1));
      if (!heard || token !== this.token || !this.playing || this.disposed) return;
    }
    this.next = null;
    this.moveTo(this.pausedTick);
    this.running = true;
    this.stopWatch = this.repeat(() => this.watch());
    await player.play();
  }

  pause() {
    if (!this.playing) return;
    this.token++;
    this.countIn.cancel();
    if (this.running) {
      this.pausedTick = Math.max(this.range.start, Math.min(this.range.end - 1, this.getTick()));
      this.ready!.pause();
    }
    this.stopWatch?.();
    this.stopWatch = null;
    this.next = null;
    this.running = false;
    this.playing = false;
  }

  isPlaying() {
    return this.playing;
  }

  seek(tick: number) {
    this.next = null;
    if (this.running) this.moveTo(tick);
    else this.pausedTick = tick;
  }

  /** Full speed only (ADR-0022); the engine keeps the tempo control locked. */
  setRate(_rate: number) {}

  setRange(range: TickRange) {
    if (range.start === this.range.start && range.end === this.range.end) return;
    const tick = this.getTick();
    const target = tick >= range.start && tick < range.end ? tick : range.start;
    this.range = range;
    this.next = null;
    if (this.running) {
      if (target !== tick) this.moveTo(target);
    } else this.pausedTick = target;
  }

  getTick() {
    if (!this.running) return this.pausedTick;
    return Math.min(this.predicted(), this.range.end - 1);
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
    this.ready?.dispose();
    this.ready = null;
  }

  // ------------------------------------------------------------------ position and loop

  private fileSeconds(tick: number) {
    return this.tempo.secondsAt(tick) + this.offset;
  }

  private ticksPerSecond(tick: number) {
    return (this.tempo.bpmAt(tick) / 60) * PPQ;
  }

  private snap(tick: number) {
    this.anchor = { tick, time: this.now() };
  }

  private moveTo(tick: number) {
    const seconds = this.fileSeconds(tick);
    this.ready!.seek(seconds);
    this.reported = seconds;
    this.snap(tick);
  }

  /** Extrapolated position, corrected toward the player's time whenever it reports a new one. */
  private predicted() {
    const { tick, time } = this.anchor;
    const predicted = tick + ((this.now() - time) / 1000) * this.ticksPerSecond(tick);
    const seconds = this.ready!.time();
    if (seconds === this.reported) return predicted;
    this.reported = seconds;
    const reported = this.tempo.tickAt(seconds - this.offset);
    if (Math.abs(reported - predicted) > QUARTER) this.snap(reported);
    else this.snap(predicted + CORRECTION * (reported - predicted));
    return this.anchor.tick;
  }

  /** Runs on a timer while playing: chooses the next range ahead of time and wraps at the end. */
  private watch() {
    if (!this.running) return;
    const tick = this.predicted();
    if (!this.next && tick >= this.range.end - LEAD_SECONDS * this.ticksPerSecond(this.range.end)) {
      this.next = this.onRangeEnd(this.range) ?? 'stop';
    }
    if (tick >= this.range.end) this.wrap();
  }

  private wrap() {
    const next = this.next ?? this.onRangeEnd(this.range) ?? 'stop';
    const from = this.range;
    if (next === 'stop') {
      this.pause();
      this.pausedTick = from.start;
      for (const l of this.listeners) l({ from, to: null });
      return;
    }
    const to = next.start === from.start && next.end === from.end ? from : next;
    this.next = null;
    this.range = to;
    // A chunk that continues where this one ends needs no seek (no gap in the audio).
    if (to.start !== from.end) this.moveTo(to.start);
    for (const l of this.listeners) l({ from, to });
  }
}
