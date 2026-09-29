// The Music source's player (ADR-0022): the song's MP3 streamed by an <audio> element (a 19-minute
// file would be about 400 MB decoded, so it is not decoded up front). The element plays through
// Web Audio (element → gain → destination) so the mixer can set master × music, and so the
// output latency is known and removed from the reported time.
import type { MusicPlayer } from './music-clock';

export interface MusicPlayerHandle extends MusicPlayer {
  /** 0–1: master × music channel gain. */
  setGain(gain: number): void;
}

const GAIN_SMOOTHING = 0.015; // seconds (time constant) for mixer changes

export function createMusicPlayer(url: string, gain: number, onProgress: (progress: number) => void): MusicPlayerHandle {
  const audio = new Audio();
  audio.preload = 'auto';
  let ctx: AudioContext | null = null;
  let out: GainNode | null = null;
  let level = gain;

  const ready = new Promise<void>((resolve, reject) => {
    audio.addEventListener('canplay', () => resolve(), { once: true });
    audio.addEventListener('error', () => reject(new Error(audio.error?.message || `could not load ${url}`)), { once: true });
  });
  audio.addEventListener('progress', () => {
    const end = audio.buffered.length ? audio.buffered.end(audio.buffered.length - 1) : 0;
    if (audio.duration > 0) onProgress(Math.min(1, end / audio.duration));
  });
  audio.src = url;

  /** Created on the first play (a user gesture), so the context starts running. */
  const graph = () => {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      out = new GainNode(ctx, { gain: level });
      ctx.createMediaElementSource(audio).connect(out).connect(ctx.destination);
    }
    return ctx;
  };

  const latency = () => (ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0);

  return {
    ready,
    async play() {
      const c = graph();
      if (c.state !== 'running') await c.resume();
      await audio.play();
    },
    pause() {
      audio.pause();
    },
    seek(seconds) {
      audio.currentTime = Math.max(0, seconds);
    },
    time() {
      return audio.currentTime - (audio.paused ? 0 : latency());
    },
    setGain(g) {
      level = g;
      if (ctx && out) out.gain.setTargetAtTime(g, ctx.currentTime, GAIN_SMOOTHING);
    },
    dispose() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      void ctx?.close();
      ctx = null;
      out = null;
    },
  };
}
