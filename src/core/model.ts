// Normalised song model (system description §6.1). Produced by scripts/build-songs.ts,
// consumed by the app. All positions are in ticks at PPQ = 960 (same as alphaTab).

export const PPQ = 960;

/** String index 0 = lowest string. */
export type StringIndex = number;

export interface TempoPoint {
  bar: number; // 1-based
  tick: number; // offset from bar start
  bpm: number; // quarter notes per minute
}

export interface Bar {
  n: number; // 1-based bar number
  time: [number, number];
  startTick: number; // absolute
  durTicks: number;
  section: string | null;
}

export interface NoteEvent {
  string: StringIndex;
  fret: number;
  pitch: number; // MIDI
  tieFromPrev: boolean; // continuation of a tied note, not a new pluck
  dead: boolean; // muted/ghost "x" note, no pitch
  finger: number | null; // 0 = open string, 1–4 = index…little, null = not fingered (dead)
  position: number | null; // hand position (fret under the index finger), null for open/dead
  retabFrom?: { string: StringIndex; fret: number }; // source tab when the solver moved the note
}

export interface BeatEvent {
  id: number;
  bar: number;
  tick: number; // offset from bar start
  start: number; // absolute tick
  dur: number;
  kind: 'note' | 'rest';
  notes: NoteEvent[]; // empty for rests
}

export interface Chunk {
  id: number;
  name: string;
  bars: [number, number];
  position: number | null; // most used hand position
  shifts: number; // position changes inside the chunk
}

export interface YouTubeMedia {
  videoId: string | null;
  sync: { bar: number; tick?: number; ms: number }[];
}

/** Audio rendered from the transcription (ADR-0022): file time = score time + offsetMs. */
export interface MusicMedia {
  url: string; // relative to the app base, e.g. data/audio/<slug>.mp3
  offsetMs: number;
}

export interface SongStats {
  durationSec: number;
  noteCount: number; // plucks (tie continuations excluded)
  maxFret: number;
  strings: StringIndex[]; // strings that carry notes
  firstBar: number; // first bar with bass notes
}

export interface SongData {
  slug: string;
  title: string;
  artist: string;
  track: { index: number; name: string }; // bass track in the Guitar Pro file (data/scores/<slug>.gp)
  tracks: string[]; // names of every track in the file, by index (the Synth mixer, ADR-0020)
  tuning: number[]; // MIDI pitch per string, lowest first
  tuningName: string;
  ppq: number;
  tempoMap: TempoPoint[];
  bars: Bar[];
  events: BeatEvent[];
  tacet: [number, number][];
  chunks: Chunk[];
  stats: SongStats;
  media: { youtube: YouTubeMedia | null; music: MusicMedia | null };
  tempoNote: string | null;
  /**
   * Only for scores with repeats (ADR-0023): the written bar index (0-based) of each played bar.
   * Bars, events and chunks count played bars; the strip unrolls the .gp with this order.
   */
  playOrder?: number[];
}

export interface CatalogEntry {
  slug: string;
  title: string;
  artist: string;
  bpm: number;
  durationSec: number;
  tuning: number[];
  tuningName: string;
  maxFret: number;
  bars: number;
  chunks: number;
  music: boolean; // has the Music source (ADR-0022)
}

/** A song before chunking and fingering: what the importer produces. */
export type ImportedSong = Pick<SongData, 'title' | 'artist' | 'track' | 'tracks' | 'tuning' | 'ppq' | 'tempoMap' | 'bars' | 'events' | 'playOrder'>;
