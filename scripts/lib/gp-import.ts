// Guitar Pro → normalised model, using alphaTab's importer (ADR-0004). Node only.
import { readFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';
import type { Bar, BeatEvent, ImportedSong, NoteEvent, TempoPoint } from '../../src/core/model';
import { PPQ } from '../../src/core/model';
import { isWrittenOrder, playedOrder, unrollScore } from '../../src/core/unroll-score';

export type Score = alphaTab.model.Score;
export type Track = alphaTab.model.Track;

/** Written bar index per played bar, for scores that were unrolled by `loadScore` / `unrollRepeats`. */
const playOrders = new WeakMap<Score, number[]>();

/** The Guitar Pro file with its repeats unrolled (ADR-0023): every later step sees played bars. */
export function loadScore(file: string): Score {
  const bytes = new Uint8Array(readFileSync(file));
  return unrollRepeats(alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings()));
}

export function unrollRepeats(written: Score): Score {
  const settings = new alphaTab.Settings();
  const order = playedOrder(alphaTab, written, settings);
  if (isWrittenOrder(order, written.masterBars.length)) return written;
  const score = unrollScore(alphaTab, written, order, settings);
  playOrders.set(score, order);
  return score;
}

/** Written bar index (0-based) of each played bar, or null when the score has no repeats. */
export function playOrderOf(score: Score): number[] | null {
  return playOrders.get(score) ?? null;
}

/** Tuning of a track, lowest string first (alphaTab stores highest first). */
export function trackTuning(track: Track): number[] {
  return [...track.staves[0]!.tuning].reverse();
}

export interface TrackInfo {
  index: number;
  name: string;
  strings: number;
  tuning: number[];
  notes: number;
  isBassCandidate: boolean;
}

export function describeTracks(score: Score): TrackInfo[] {
  return score.tracks.map((t) => {
    const staff = t.staves[0]!;
    let notes = 0;
    for (const bar of staff.bars) for (const v of bar.voices) for (const b of v.beats) notes += b.notes.length;
    const strings = staff.tuning.length;
    return {
      index: t.index,
      name: t.name,
      strings,
      tuning: trackTuning(t),
      notes,
      isBassCandidate: strings === 4 && /bass/i.test(t.name) && notes > 0,
    };
  });
}

/**
 * The bass track: sidecar hint (name or index) if given, else the 4-string track with
 * "bass" in its name and the most notes.
 */
export function pickBassTrack(score: Score, hint?: string | number): Track {
  if (typeof hint === 'number') {
    const t = score.tracks[hint];
    if (!t) throw new Error(`bassTrack index ${hint} does not exist (${score.tracks.length} tracks)`);
    return t;
  }
  if (typeof hint === 'string') {
    const t = score.tracks.find((tr) => tr.name === hint);
    if (!t) throw new Error(`bassTrack "${hint}" not found. Tracks: ${score.tracks.map((tr) => `"${tr.name}"`).join(', ')}`);
    return t;
  }
  const candidates = describeTracks(score)
    .filter((t) => t.isBassCandidate)
    .sort((a, b) => b.notes - a.notes);
  if (!candidates[0]) throw new Error('No 4-string track with "bass" in its name; set bassTrack in song.yaml');
  return score.tracks[candidates[0].index]!;
}

export interface ImportResult {
  song: ImportedSong;
  warnings: string[];
}

export function importBassTrack(score: Score, track: Track): ImportResult {
  const warnings: string[] = [];
  const staff = track.staves[0]!;
  if (staff.tuning.length !== 4) throw new Error(`Track "${track.name}" has ${staff.tuning.length} strings; only 4-string bass is supported`);
  const tuning = trackTuning(track).map((p) => p + staff.capo);

  const masterBars = score.masterBars;
  if (masterBars.some((mb) => mb.isRepeatStart || mb.repeatCount > 0 || mb.alternateEndings || mb.directions?.size)) {
    throw new Error('Score has repeat signs or jumps; load it with loadScore or unrollRepeats first (ADR-0023)');
  }

  const bars: Bar[] = masterBars.map((mb) => ({
    n: mb.index + 1,
    time: [mb.timeSignatureNumerator, mb.timeSignatureDenominator],
    startTick: mb.start,
    durTicks: mb.calculateDuration(),
    section: mb.section?.text?.trim() || null,
  }));

  const tempoMap: TempoPoint[] = [];
  for (const mb of masterBars) {
    for (const a of mb.tempoAutomations) {
      const tick = Math.round(a.ratioPosition * mb.calculateDuration());
      const last = tempoMap[tempoMap.length - 1];
      if (last && last.bpm === a.value) continue;
      tempoMap.push({ bar: mb.index + 1, tick, bpm: a.value });
    }
  }
  if (tempoMap.length === 0 || tempoMap[0]!.bar !== 1 || tempoMap[0]!.tick !== 0) {
    tempoMap.unshift({ bar: 1, tick: 0, bpm: score.tempo });
  }

  const events: BeatEvent[] = [];
  let voiceWarned = false;
  for (const bar of staff.bars) {
    const mb = masterBars[bar.index]!;
    for (const voice of bar.voices) {
      if (voice.index > 0) {
        if (!voiceWarned && voice.beats.some((b) => !b.isEmpty && b.notes.length > 0)) {
          warnings.push(`Voice ${voice.index + 1} has notes (bar ${bar.index + 1}); only voice 1 is imported`);
          voiceWarned = true;
        }
        continue;
      }
      for (const beat of voice.beats) {
        if (beat.isEmpty) continue;
        const notes: NoteEvent[] = beat.notes
          .map((n) => {
            const string = n.string - 1;
            return {
              string,
              fret: n.fret,
              pitch: tuning[string]! + n.fret,
              tieFromPrev: n.isTieDestination,
              dead: n.isDead,
              finger: null,
              position: null,
            };
          })
          .sort((a, b) => a.string - b.string);
        events.push({
          id: events.length,
          bar: bar.index + 1,
          tick: beat.playbackStart,
          start: mb.start + beat.playbackStart,
          dur: beat.playbackDuration,
          kind: notes.length > 0 ? 'note' : 'rest',
          notes,
        });
      }
    }
  }
  events.sort((a, b) => a.start - b.start);
  events.forEach((e, i) => (e.id = i));

  const playOrder = playOrderOf(score);
  return {
    song: {
      title: score.title.trim(),
      artist: score.artist.trim(),
      track: { index: track.index, name: track.name },
      tracks: score.tracks.map((t) => t.name),
      tuning,
      ppq: PPQ,
      tempoMap,
      bars,
      events,
      ...(playOrder ? { playOrder } : {}),
    },
    warnings,
  };
}
