// Lead-in measurement for the Music source (ADR-0022). The MP3 is rendered from the transcription,
// so its note onsets follow the score's tempo map; only the start offset is unknown.
//
// 1. Estimate: the first audible hop (within 45 dB of the loudest) minus the score time of the first
//    onset in any track. Rendered files start playing at once and end with a tail.
// 2. Refine and check: cross-correlate the onset envelope (rise in log energy per 10 ms hop) with the
//    score onsets within ±150 ms of the estimate, for the first and for the last minute of notes.
//    A difference between the two means drift: the audio does not follow the tempo map. The window
//    is narrow on purpose: riffs repeat every beat, so a wide search finds equally good wrong lags.
// Node only (inspect-song --audio).
import { readFileSync } from 'node:fs';
import type { Score } from './gp-import';

export const HOP_SECONDS = 0.01;
const SILENCE_DB = 45; // below the loudest hop
export const REFINE_SECONDS = 0.15;

export interface Alignment {
  /** Audio time of score time 0, in seconds. */
  lagSec: number;
  /** Best score divided by the mean score over the searched lags (1 = no preference). */
  confidence: number;
}

/** Absolute ticks of every beat in any track that starts a sound (rests and tie continuations excluded). */
export function scoreOnsetTicks(score: Score): number[] {
  const ticks = new Set<number>();
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        const start = score.masterBars[bar.index]!.start;
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.isEmpty || beat.notes.length === 0 || beat.notes.every((n) => n.isTieDestination)) continue;
            ticks.add(start + beat.playbackStart);
          }
        }
      }
    }
  }
  return [...ticks].sort((a, b) => a - b);
}

/** Level (dB) and onset strength (positive change in level) per hop of a mono mix. */
export class OnsetEnvelope {
  readonly levels: number[] = [];
  readonly values: number[] = [];
  private readonly hop: number;
  private acc = 0;
  private count = 0;

  constructor(sampleRate: number) {
    this.hop = Math.round(sampleRate * HOP_SECONDS);
  }

  push(channels: Float32Array[], length: number) {
    for (let i = 0; i < length; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i]!;
      s /= channels.length;
      this.acc += s * s;
      if (++this.count === this.hop) this.flush();
    }
  }

  private flush() {
    const level = 10 * Math.log10(this.acc / this.count + 1e-12);
    const prev = this.levels[this.levels.length - 1];
    this.values.push(prev === undefined ? 0 : Math.max(0, level - prev));
    this.levels.push(level);
    this.acc = 0;
    this.count = 0;
  }
}

/** Seconds to the first hop within 45 dB of the loudest one. */
export function firstSoundSec(levels: number[]): number {
  const max = Math.max(...levels);
  return Math.max(0, levels.findIndex((l) => l > max - SILENCE_DB)) * HOP_SECONDS;
}

/**
 * The lag (audio time − score time) within [minLagSec, maxLagSec] that lines the score onsets up with
 * peaks of the envelope. Each onset is scored with a [0.5, 1, 0.5] kernel, so rounding by a hop
 * still counts but the exact lag wins.
 */
export function alignOnsets(envelope: ArrayLike<number>, onsetSec: number[], minLagSec: number, maxLagSec: number): Alignment {
  const minLag = Math.round(minLagSec / HOP_SECONDS);
  const maxLag = Math.round(maxLagSec / HOP_SECONDS);
  const hops = onsetSec.map((t) => Math.round(t / HOP_SECONDS));
  const at = (i: number) => (i >= 0 && i < envelope.length ? envelope[i]! : 0);
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (const h of hops) sum += at(h + lag) + 0.5 * (at(h + lag - 1) + at(h + lag + 1));
    scores.push(sum);
  }
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i]! > scores[best]!) best = i;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length || 1;
  return { lagSec: (best + minLag) * HOP_SECONDS, confidence: scores[best]! / mean };
}

export interface AudioAnalysis {
  durationSec: number;
  levels: number[];
  envelope: number[];
}

export interface OffsetReport {
  /** First sound minus first score onset. */
  estimateSec: number;
  head: Alignment;
  tail: Alignment;
}

/** Offset of the audio against the score onsets (seconds), estimated and checked at both ends. */
export function measureOffset(audio: AudioAnalysis, onsetSec: number[]): OffsetReport {
  const estimateSec = firstSoundSec(audio.levels) - (onsetSec[0] ?? 0);
  const last = onsetSec[onsetSec.length - 1] ?? 0;
  const window = (onsets: number[]) => alignOnsets(audio.envelope, onsets, estimateSec - REFINE_SECONDS, estimateSec + REFINE_SECONDS);
  return {
    estimateSec,
    head: window(onsetSec.filter((t) => t <= (onsetSec[0] ?? 0) + 60)),
    tail: window(onsetSec.filter((t) => t >= last - 60)),
  };
}

/** Decodes an MP3 in slices (a long file would not fit in memory as PCM) into its envelope. */
export async function analyseMp3(file: string): Promise<AudioAnalysis> {
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const bytes = new Uint8Array(readFileSync(file));
  let envelope: OnsetEnvelope | null = null;
  let samples = 0;
  let rate = 44100;
  const SLICE = 1 << 20;
  for (let at = 0; at < bytes.length; at += SLICE) {
    const { channelData, samplesDecoded, sampleRate } = decoder.decode(bytes.subarray(at, at + SLICE));
    if (!samplesDecoded) continue;
    rate = sampleRate;
    envelope ??= new OnsetEnvelope(sampleRate);
    envelope.push(channelData, samplesDecoded);
    samples += samplesDecoded;
  }
  decoder.free();
  return { durationSec: samples / rate, levels: envelope?.levels ?? [], envelope: envelope?.values ?? [] };
}
