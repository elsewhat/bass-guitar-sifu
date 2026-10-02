// The metronome's sounds on Web Audio, shared by the Count source and the count-in of the other
// sources (ADR-0025). Two mixer channels (ADR-0020): Click, a short tone on every count, and Voice,
// the recorded WAVs in public/audio/count/ when they exist (public/audio/count/README.md).
// Graph: click gain → master gain → destination, voice gain → master gain.
import { sampleName } from '../core/count';

const GAIN_SMOOTHING = 0.015; // seconds (time constant) for mixer changes

/** Gains 0–1 from the mixer; `click` and `voice` exclude the master. */
export interface CountGains {
  master: number;
  click: number;
  voice: number;
}

/** Whether the recorded count samples exist (checks `one.wav`); the mixer disables Voice without them. */
export async function countSamplesAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/count/one.wav`, { method: 'HEAD' });
    return res.ok && !res.headers.get('content-type')?.includes('text/html');
  } catch {
    return false;
  }
}

export class CountSounds {
  private ctx: AudioContext | null = null;
  private bus: { master: GainNode; click: GainNode; voice: GainNode } | null = null;
  private samples = new Map<string, AudioBuffer>();
  private requested = new Set<string>();
  private nodes: { node: AudioScheduledSourceNode; time: number }[] = [];

  constructor(private gains: CountGains = { master: 1, click: 1, voice: 1 }) {}

  /** The audio context, created on first use; call from a user gesture the first time (audio unlock). */
  context(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const gain = (value: number) => new GainNode(ctx, { gain: value });
      const master = gain(this.gains.master);
      master.connect(ctx.destination);
      const click = gain(this.gains.click);
      const voice = gain(this.gains.voice);
      click.connect(master);
      voice.connect(master);
      this.ctx = ctx;
      this.bus = { master, click, voice };
    }
    return this.ctx;
  }

  /** The audio-clock time of the sample leaving the speakers now. */
  audibleTime(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const ts = ctx.getOutputTimestamp?.();
    if (ts?.contextTime !== undefined && ts.performanceTime) {
      return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  /** Mixer levels; they apply to sounds already scheduled too. */
  setMix(gains: CountGains) {
    this.gains = gains;
    const { bus, ctx } = this;
    if (!bus || !ctx) return;
    for (const k of ['master', 'click', 'voice'] as const) bus[k].gain.setTargetAtTime(gains[k], ctx.currentTime, GAIN_SMOOTHING);
  }

  /** One count: the sample on the voice channel and the tone on the click channel, each skipped when silent. */
  sound(label: string, time: number) {
    const ctx = this.context();
    const bus = this.bus!;
    const { master, click, voice } = this.gains;
    if (master <= 0) return;
    const buffer = this.samples.get(sampleName(label));
    if (buffer && voice > 0) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(bus.voice);
      src.start(time);
      this.nodes.push({ node: src, time });
    }
    if (click > 0) this.tone(ctx, bus.click, label, time);
  }

  /** Stops every sound scheduled after now. */
  cancel() {
    const now = this.ctx?.currentTime ?? 0;
    for (const n of this.nodes) if (n.time > now) n.node.stop();
    this.nodes = [];
  }

  /** Forgets sounds that have played. */
  prune() {
    const now = this.ctx?.currentTime ?? 0;
    this.nodes = this.nodes.filter((n) => n.time > now - 1);
  }

  /** Loads the recorded samples for these labels once; missing files keep the tones. */
  loadSamples(labels: Iterable<string>) {
    const ctx = this.context();
    for (const label of labels) {
      const name = sampleName(label);
      if (this.requested.has(name)) continue;
      this.requested.add(name);
      void fetch(`${import.meta.env.BASE_URL}audio/count/${name}.wav`)
        .then(async (res) => {
          if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return;
          this.samples.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        })
        .catch(() => undefined);
    }
  }

  dispose() {
    this.cancel();
    void this.ctx?.close();
    this.ctx = null;
    this.bus = null;
  }

  /** The click, as in the design prototype: beat 1 high, other beats middle, "and" low. */
  private tone(ctx: AudioContext, out: AudioNode, label: string, time: number) {
    const onBeat = label !== '&';
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = label === '1' ? 1320 : onBeat ? 990 : 660;
    const len = onBeat ? 0.07 : 0.04;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(onBeat ? 0.5 : 0.25, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + len);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + len + 0.02);
    this.nodes.push({ node: osc, time });
  }
}
