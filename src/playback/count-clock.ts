// Count source, shown as "Metronome" (ADR-0008, system description §5.4): "1 & 2 & …" on the Web
// Audio clock with a look-ahead scheduler (about 100 ms ahead, every 25 ms), so timing does not
// depend on timer accuracy. The sounds and mixer channels are in count-sounds.ts. A count-in
// (ADR-0025) is scheduled on the same audio clock right before the timeline starts, so the first
// count of the chunk follows it exactly.
import { countLabel } from '../core/count';
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import { tempoLookup, type TempoLookup } from '../core/timing';
import type { PassCompleted, PlaybackClock, PlayOptions } from './clock';
import { countInPlan, countInState, type CountInPlan, type CountInState } from './count-in';
import { CountSounds, type CountGains } from './count-sounds';
import { CountTimeline } from './count-timeline';

export { countSamplesAvailable, type CountGains } from './count-sounds';

const LOOKAHEAD = 0.1; // seconds scheduled ahead
const INTERVAL = 25; // ms between scheduler runs
const START_DELAY = 0.03; // seconds between a (re)start and the first sound

export class CountClock implements PlaybackClock {
  readonly capabilities = { rates: 'continuous', video: false } as const;
  onRangeEnd = (range: TickRange) => range;

  private readonly sounds = new CountSounds();
  private samplesRequested = false;
  private readonly tempo: TempoLookup;
  private readonly timeline: CountTimeline;
  private playing = false;
  private range: TickRange = { start: 0, end: 0 };
  private rate = 1;
  private pausedTick = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pendingWraps: (PassCompleted & { time: number })[] = [];
  private countIn: { plan: CountInPlan; start: number } | null = null; // start: audio time of the first count-in moment
  private readonly listeners = new Set<(e: PassCompleted) => void>();

  constructor(private readonly song: { bars: Bar[]; tempoMap: TempoPoint[] }) {
    this.tempo = tempoLookup(song.tempoMap, song.bars);
    this.timeline = new CountTimeline(song.bars, this.tempo, (r) => this.onRangeEnd(r));
  }

  async play(options?: PlayOptions) {
    if (this.playing) return;
    const ctx = this.sounds.context();
    const resumed = ctx.resume();
    this.loadSamples();
    this.playing = true;
    this.restartAt(this.pausedTick, options?.countIn ?? false);
    this.timer = setInterval(() => this.pump(), INTERVAL);
    await resumed;
  }

  pause() {
    if (!this.playing) return;
    this.pausedTick = this.getTick();
    this.playing = false;
    this.countIn = null;
    clearInterval(this.timer);
    this.cancelScheduled();
  }

  isPlaying() {
    return this.playing;
  }

  seek(tick: number) {
    if (this.playing) this.restartAt(tick, this.countingIn());
    else this.pausedTick = tick;
  }

  setRate(rate: number) {
    if (rate === this.rate) return;
    const tick = this.getTick();
    this.rate = rate;
    if (this.playing) this.restartAt(tick, this.countingIn());
  }

  setRange(range: TickRange) {
    const same = (a: TickRange) => a.start === range.start && a.end === range.end;
    if (same(this.range) && (!this.playing || same(this.timeline.currentRange))) return;
    this.range = range;
    const tick = this.getTick();
    const inside = tick >= range.start && tick < range.end;
    if (this.playing) this.restartAt(inside ? tick : range.start, this.countingIn());
    else if (!inside) this.pausedTick = range.start;
  }

  getTick() {
    return this.playing ? this.timeline.positionAt(this.sounds.audibleTime()) : this.pausedTick;
  }

  countInState(): CountInState | null {
    if (!this.countIn) return null;
    const elapsed = this.sounds.audibleTime() - this.countIn.start;
    return elapsed < this.countIn.plan.duration ? countInState(this.countIn.plan, elapsed) : null;
  }

  onPassCompleted(listener: (e: PassCompleted) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Mixer levels; they apply to sounds already scheduled too. */
  setMix(gains: CountGains) {
    this.sounds.setMix(gains);
  }

  dispose() {
    this.pause();
    this.listeners.clear();
    this.sounds.dispose();
  }

  // ------------------------------------------------------------------ scheduling

  /** A count-in has been scheduled and is not over yet (a restart during it counts in again). */
  private countingIn() {
    return !!this.countIn && this.sounds.context().currentTime < this.countIn.start + this.countIn.plan.duration;
  }

  private restartAt(tick: number, countIn: boolean) {
    const ctx = this.sounds.context();
    this.cancelScheduled();
    let start = ctx.currentTime + START_DELAY;
    this.countIn = null;
    if (countIn) {
      const inside = tick >= this.range.start && tick < this.range.end ? tick : this.range.start;
      const plan = countInPlan(this.song.bars, this.tempo, inside, this.rate);
      for (const beat of plan.beats) this.sounds.sound(beat.label, start + beat.offset);
      this.countIn = { plan, start };
      start += plan.duration;
    }
    this.timeline.start(tick, start, this.range, this.rate);
    this.pump();
  }

  private pump() {
    if (!this.playing) return;
    const ctx = this.sounds.context();
    for (const step of this.timeline.fill(ctx.currentTime + LOOKAHEAD)) {
      if (step.kind === 'wrap') this.pendingWraps.push({ time: step.time, from: step.from, to: step.to });
      else if (step.label) this.sounds.sound(step.label, step.time);
    }
    const heard = this.sounds.audibleTime();
    while (this.pendingWraps[0] && this.pendingWraps[0].time <= heard) {
      const { from, to } = this.pendingWraps.shift()!;
      this.range = to;
      for (const l of this.listeners) l({ from, to });
    }
    this.timeline.prune(heard);
    this.sounds.prune();
  }

  private cancelScheduled() {
    this.sounds.cancel();
    this.pendingWraps = [];
  }

  /** Loads the recorded count samples this song's meters need; missing files keep the tones. */
  private loadSamples() {
    if (this.samplesRequested) return;
    this.samplesRequested = true;
    const labels = new Set<string>();
    for (const bar of this.song.bars) {
      for (let i = 0; i < (bar.time[0] * 8) / bar.time[1]; i++) {
        const label = countLabel(bar.time, i);
        if (label) labels.add(label);
      }
    }
    this.sounds.loadSamples(labels);
  }
}
