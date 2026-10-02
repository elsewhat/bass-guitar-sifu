// Synth source (ADR-0017, ADR-0019): the alphaTab player behind the PlaybackClock interface.
// alphaTab reports positions only when the audio output has consumed a buffer (about every 46 ms),
// so the position is extrapolated per animation frame and corrected toward each report (ADR-0017
// clock guide). alphaTab loops the chunk itself. Shortly before the range end this adapter asks the
// loop controller where to continue (ADR-0018); another pass needs nothing, and a different chunk
// is set as alphaTab's range when the wrap is heard. Setting the range makes alphaTab seek to its
// start, which is why it cannot be changed ahead of the wrap.
//
// The player is a small port (`SynthPlayer`), implemented over alphaTab in
// src/strip/synth-player.ts, so this module has no alphaTab import and is unit tested with a fake.
import type { Bar, TempoPoint } from '../core/model';
import { PPQ } from '../core/model';
import type { TickRange } from '../core/plucks';
import { tempoLookup, type TempoLookup } from '../core/timing';
import type { PassCompleted, PlaybackClock, PlayOptions } from './clock';
import { countInPlan, NO_COUNT_IN, type CountInPort, type CountInState } from './count-in';

export interface SynthPlayer {
  play(): void;
  pause(): void;
  seek(tick: number): void;
  setSpeed(rate: number): void;
  /** The looped range (alphaTab `playbackRange` with `isLooping`). The player moves to its start. */
  setRange(range: TickRange): void;
  /** Reported (audible) positions. */
  onPosition(listener: (tick: number, isSeek: boolean) => void): () => void;
  /** The range end was heard and the player went back to the range start. */
  onWrap(listener: () => void): () => void;
  /** Resolves once the soundfont and this song's MIDI are loaded. */
  readonly ready: Promise<void>;
  dispose(): void;
}

const QUARTER = PPQ;
const CORRECTION = 0.2; // share of the error corrected per report
const LEAD_SECONDS = 0.25; // the next range is chosen this long before the range end

export class SynthClock implements PlaybackClock {
  readonly capabilities = { rates: 'continuous', video: false } as const;
  onRangeEnd = (range: TickRange) => range;

  private readonly tempo: TempoLookup;
  private readonly bars: Bar[];
  private readonly listeners = new Set<(e: PassCompleted) => void>();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly player: Promise<SynthPlayer>;
  private ready: SynthPlayer | null = null;
  private disposed = false;

  private playing = false; // play() was called (the player may still be loading)
  private running = false; // the player is playing
  private token = 0;
  private rate = 1;
  private pausedTick = 0;
  private anchor = { tick: 0, time: 0 };

  private range: TickRange = { start: 0, end: 0 };
  /** Where to continue after this pass; chosen shortly before the range end. */
  private next: TickRange | null = null;

  constructor(
    song: { bars: Bar[]; tempoMap: TempoPoint[] },
    player: Promise<SynthPlayer>,
    private readonly now: () => number = () => performance.now(),
    private readonly countIn: CountInPort = NO_COUNT_IN,
  ) {
    this.tempo = tempoLookup(song.tempoMap, song.bars);
    this.bars = song.bars;
    this.player = player.then(async (p) => {
      await p.ready;
      if (this.disposed) {
        p.dispose();
        throw new Error('disposed');
      }
      this.ready = p;
      this.unsubscribe.push(
        p.onPosition((tick, isSeek) => this.onPosition(tick, isSeek)),
        p.onWrap(() => this.wrapped()),
      );
      p.setSpeed(this.rate);
      p.setRange(this.range);
      p.seek(this.pausedTick);
      return p;
    });
    this.player.catch(() => undefined); // failures surface through play() and the engine
  }

  async play(options?: PlayOptions) {
    if (this.playing) return;
    this.playing = true;
    const token = ++this.token;
    if (options?.countIn) this.countIn.prepare();
    let player: SynthPlayer;
    try {
      player = await this.player;
    } catch {
      if (token === this.token) this.playing = false; // the engine reports the load error
      return;
    }
    if (token !== this.token || !this.playing || this.disposed) return;
    if (options?.countIn) {
      const heard = await this.countIn.run(countInPlan(this.bars, this.tempo, this.pausedTick, this.rate));
      if (!heard || token !== this.token || !this.playing || this.disposed) return;
    }
    this.next = null;
    player.seek(this.pausedTick);
    this.snap(this.pausedTick);
    this.running = true;
    player.play();
  }

  pause() {
    if (!this.playing) return;
    this.token++;
    this.countIn.cancel();
    if (this.running) {
      this.pausedTick = Math.max(this.range.start, Math.min(this.range.end - 1, this.getTick()));
      this.ready!.pause();
    }
    this.next = null;
    this.running = false;
    this.playing = false;
  }

  isPlaying() {
    return this.playing;
  }

  seek(tick: number) {
    this.next = null;
    if (this.running) {
      this.ready!.seek(tick);
      this.snap(tick);
    } else this.pausedTick = tick;
  }

  setRate(rate: number) {
    if (rate === this.rate) return;
    if (this.running) this.snap(this.getTick());
    this.rate = rate;
    this.ready?.setSpeed(rate);
  }

  setRange(range: TickRange) {
    if (range.start === this.range.start && range.end === this.range.end) return;
    const tick = this.getTick();
    const target = tick >= range.start && tick < range.end ? tick : range.start;
    this.range = range;
    this.next = null;
    if (this.running) {
      this.ready!.setRange(range);
      if (target !== range.start) this.ready!.seek(target);
      this.snap(target);
    } else {
      this.ready?.setRange(range);
      this.pausedTick = target;
    }
  }

  getTick() {
    if (!this.running) return this.pausedTick;
    const { tick, time } = this.anchor;
    const predicted = tick + ((this.now() - time) / 1000) * this.ticksPerSecond(tick);
    return Math.min(predicted, this.range.end - 1);
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
    for (const u of this.unsubscribe) u();
    this.ready?.dispose();
    this.ready = null;
  }

  // ------------------------------------------------------------------ position and loop

  private ticksPerSecond(tick: number) {
    return (this.tempo.bpmAt(tick) / 60) * PPQ * this.rate;
  }

  private snap(tick: number) {
    this.anchor = { tick, time: this.now() };
  }

  private onPosition(tick: number, isSeek: boolean) {
    if (!this.running) return;
    const predicted = this.getTick();
    if (isSeek) this.snap(tick);
    else if (tick < predicted - QUARTER && this.next) {
      this.wrapped(); // fallback when the wrap event is missed
      return;
    } else if (Math.abs(tick - predicted) > QUARTER) this.snap(tick);
    else this.snap(predicted + CORRECTION * (tick - predicted));

    // Shortly before the range end, ask the loop controller where to continue.
    if (!this.next && this.getTick() >= this.range.end - LEAD_SECONDS * this.ticksPerSecond(this.range.end)) {
      this.next = this.onRangeEnd(this.range);
    }
  }

  /** The range end was heard and alphaTab went back to the range start. */
  private wrapped() {
    if (!this.running) return;
    const next = this.next ?? this.onRangeEnd(this.range);
    const from = this.range;
    const to = next.start === from.start && next.end === from.end ? from : next;
    this.next = null;
    if (to !== from) {
      this.range = to;
      this.ready!.setRange(to); // moves the player to the new chunk's start
    }
    this.snap(to.start);
    for (const l of this.listeners) l({ from, to });
  }
}
