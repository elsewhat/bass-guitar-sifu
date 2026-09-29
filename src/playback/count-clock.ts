// Count source (ADR-0008, system description §5.4): the spoken "1 & 2 & …" on the Web Audio
// clock with a look-ahead scheduler (about 100 ms ahead, every 25 ms), so timing does not depend
// on timer accuracy. Plays the WAVs in public/audio/count/ when they exist and short synthesised
// tones otherwise (public/audio/count/README.md).
import { countLabel, sampleName } from '../core/count';
import type { Bar, TempoPoint } from '../core/model';
import type { TickRange } from '../core/plucks';
import { tempoLookup } from '../core/timing';
import type { PassCompleted, PlaybackClock } from './clock';
import { CountTimeline } from './count-timeline';

const LOOKAHEAD = 0.1; // seconds scheduled ahead
const INTERVAL = 25; // ms between scheduler runs
const START_DELAY = 0.03; // seconds between a (re)start and the first sound

export class CountClock implements PlaybackClock {
  readonly capabilities = { rates: 'continuous', video: false } as const;
  onRangeEnd = (range: TickRange) => range;

  private ctx: AudioContext | null = null;
  private samples = new Map<string, AudioBuffer>();
  private samplesRequested = false;
  private readonly timeline: CountTimeline;
  private playing = false;
  private range: TickRange = { start: 0, end: 0 };
  private rate = 1;
  private pausedTick = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nodes: { node: AudioScheduledSourceNode; time: number }[] = [];
  private pendingWraps: (PassCompleted & { time: number })[] = [];
  private readonly listeners = new Set<(e: PassCompleted) => void>();

  constructor(private readonly song: { bars: Bar[]; tempoMap: TempoPoint[] }) {
    this.timeline = new CountTimeline(song.bars, tempoLookup(song.tempoMap, song.bars), (r) => this.onRangeEnd(r));
  }

  async play() {
    if (this.playing) return;
    const ctx = this.context();
    const resumed = ctx.resume();
    this.loadSamples(ctx);
    this.playing = true;
    this.restartAt(this.pausedTick);
    this.timer = setInterval(() => this.pump(), INTERVAL);
    await resumed;
  }

  pause() {
    if (!this.playing) return;
    this.pausedTick = this.getTick();
    this.playing = false;
    clearInterval(this.timer);
    this.cancelScheduled();
  }

  isPlaying() {
    return this.playing;
  }

  seek(tick: number) {
    if (this.playing) this.restartAt(tick);
    else this.pausedTick = tick;
  }

  setRate(rate: number) {
    if (rate === this.rate) return;
    const tick = this.getTick();
    this.rate = rate;
    if (this.playing) this.restartAt(tick);
  }

  setRange(range: TickRange) {
    const same = (a: TickRange) => a.start === range.start && a.end === range.end;
    if (same(this.range) && (!this.playing || same(this.timeline.currentRange))) return;
    this.range = range;
    const tick = this.getTick();
    const inside = tick >= range.start && tick < range.end;
    if (this.playing) this.restartAt(inside ? tick : range.start);
    else if (!inside) this.pausedTick = range.start;
  }

  getTick() {
    return this.playing ? this.timeline.positionAt(this.audibleTime()) : this.pausedTick;
  }

  onPassCompleted(listener: (e: PassCompleted) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  dispose() {
    this.pause();
    this.listeners.clear();
    void this.ctx?.close();
    this.ctx = null;
  }

  // ------------------------------------------------------------------ scheduling

  private context() {
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    return this.ctx;
  }

  /** The audio-clock time of the sample leaving the speakers now. */
  private audibleTime() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const ts = ctx.getOutputTimestamp?.();
    if (ts?.contextTime !== undefined && ts.performanceTime) {
      return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  private restartAt(tick: number) {
    const ctx = this.context();
    this.cancelScheduled();
    this.timeline.start(tick, ctx.currentTime + START_DELAY, this.range, this.rate);
    this.pump();
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    for (const step of this.timeline.fill(ctx.currentTime + LOOKAHEAD)) {
      if (step.kind === 'wrap') this.pendingWraps.push({ time: step.time, from: step.from, to: step.to });
      else if (step.label) this.sound(ctx, step.label, step.time);
    }
    const heard = this.audibleTime();
    while (this.pendingWraps[0] && this.pendingWraps[0].time <= heard) {
      const { from, to } = this.pendingWraps.shift()!;
      this.range = to;
      for (const l of this.listeners) l({ from, to });
    }
    this.timeline.prune(heard);
    this.nodes = this.nodes.filter((n) => n.time > ctx.currentTime - 1);
  }

  private cancelScheduled() {
    const now = this.ctx?.currentTime ?? 0;
    for (const n of this.nodes) if (n.time > now) n.node.stop();
    this.nodes = [];
    this.pendingWraps = [];
  }

  private sound(ctx: AudioContext, label: string, time: number) {
    const buffer = this.samples.get(sampleName(label));
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(time);
      this.nodes.push({ node: src, time });
      return;
    }
    // Stand-in for the recorded samples, as in the design prototype: beat 1 high, other beats
    // middle, "and" low.
    const onBeat = label !== '&';
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = label === '1' ? 1320 : onBeat ? 990 : 660;
    const len = onBeat ? 0.07 : 0.04;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(onBeat ? 0.5 : 0.25, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + len + 0.02);
    this.nodes.push({ node: osc, time });
  }

  /** Loads the recorded count samples this song's meters need; missing files keep the tones. */
  private loadSamples(ctx: AudioContext) {
    if (this.samplesRequested) return;
    this.samplesRequested = true;
    const names = new Set<string>();
    for (const bar of this.song.bars) {
      for (let i = 0; i < (bar.time[0] * 8) / bar.time[1]; i++) {
        const label = countLabel(bar.time, i);
        if (label) names.add(sampleName(label));
      }
    }
    for (const name of names) {
      void fetch(`${import.meta.env.BASE_URL}audio/count/${name}.wav`)
        .then(async (res) => {
          if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return;
          this.samples.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        })
        .catch(() => undefined);
    }
  }
}
