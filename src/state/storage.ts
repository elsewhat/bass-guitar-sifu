// Browser storage (ADR-0010): versioned localStorage keys, every access in try/catch so the app
// works with empty, blocked or corrupt storage. `bass-trainer:v1:settings` holds global settings;
// per-song keys are `bass-trainer:v1:<slug>`.
import { REPEAT_MODES, type RepeatMode } from '../playback/loop';
import { clampVolume, DEFAULT_MIX, DEFAULT_TRACK_VOLUME, defaultTracks, type Channel, type GlobalMix, type TrackChannel } from '../playback/mixer';

const PREFIX = 'bass-trainer:v1:';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export function readKey(key: string): Json {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + key) ?? '{}');
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

/** Merges `patch` into the object stored under `key`. */
export function writeKey(key: string, patch: Json) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ...readKey(key), ...patch }));
  } catch {
    // Storage full or blocked: the setting lasts for this session only.
  }
}

function readChannel(raw: unknown, fallback: Channel): Channel {
  if (!isObject(raw)) return fallback;
  return {
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? clampVolume(raw.volume) : fallback.volume,
    muted: typeof raw.muted === 'boolean' ? raw.muted : fallback.muted,
  };
}

export interface Settings {
  repeatMode: RepeatMode;
  /** Master, YouTube, Music and Metronome channels (ADR-0020, ADR-0022). */
  mixer: GlobalMix;
  /** Lyrics shown in the video cell when the song has them (ADR-0024). */
  lyricsOn: boolean;
}

export function loadSettings(): Partial<Settings> {
  const raw = readKey('settings');
  const out: Partial<Settings> = {};
  if (REPEAT_MODES.includes(raw.repeatMode as RepeatMode)) out.repeatMode = raw.repeatMode as RepeatMode;
  if (typeof raw.lyricsOn === 'boolean') out.lyricsOn = raw.lyricsOn;
  if (isObject(raw.mixer)) {
    const m = raw.mixer;
    out.mixer = {
      master: readChannel(m.master, DEFAULT_MIX.master),
      video: readChannel(m.video, DEFAULT_MIX.video),
      music: readChannel(m.music, DEFAULT_MIX.music),
      click: readChannel(m.click, DEFAULT_MIX.click),
      voice: readChannel(m.voice, DEFAULT_MIX.voice),
    };
  }
  return out;
}

export function saveSettings(patch: Partial<Settings>) {
  writeKey('settings', patch);
}

interface StoredTrack extends TrackChannel {
  index: number;
  name: string;
}

/**
 * The Synth track mix of a song (`<slug>.synthTracks`), matched by track index and name since
 * track lists differ per file. Tracks without a match get 80 %; with no match at all, the default
 * "Bass only".
 */
export function loadSynthTracks(song: { slug: string; tracks: string[]; track: { index: number } }): TrackChannel[] {
  const stored = readKey(song.slug).synthTracks;
  const list = Array.isArray(stored) ? stored.filter(isObject) : [];
  let matched = 0;
  const tracks = song.tracks.map((name, index): TrackChannel => {
    const s = list.find((t) => t.index === index && t.name === name);
    if (!s) return { volume: DEFAULT_TRACK_VOLUME, muted: false, solo: false };
    matched++;
    return { ...readChannel(s, { volume: DEFAULT_TRACK_VOLUME, muted: false }), solo: s.solo === true };
  });
  return matched ? tracks : defaultTracks(song.tracks.length, song.track.index);
}

export function saveSynthTracks(song: { slug: string; tracks: string[] }, tracks: TrackChannel[]) {
  const synthTracks: StoredTrack[] = tracks.map((t, index) => ({ index, name: song.tracks[index] ?? '', volume: t.volume, muted: t.muted, solo: t.solo }));
  writeKey(song.slug, { synthTracks });
}

/** Practice progress of a song (ADR-0010), stored as `<slug>.progress`. */
export interface Progress {
  chunkIndex: number;
  done: Record<number, number>; // chunk index → tempo % it was completed at
  tempoPct: number;
  lastPractised: string; // ISO date and time
}

/** The stored progress, dropping chunks outside `chunkCount`; null when the song was never practised. */
export function loadProgress(slug: string, chunkCount: number): Progress | null {
  const raw = readKey(slug).progress;
  if (!isObject(raw)) return null;
  const inRange = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < chunkCount;
  const done: Record<number, number> = {};
  if (isObject(raw.done)) {
    for (const [key, tempo] of Object.entries(raw.done)) {
      const i = Number(key);
      if (inRange(i) && typeof tempo === 'number' && Number.isFinite(tempo)) done[i] = tempo;
    }
  }
  return {
    chunkIndex: inRange(raw.chunkIndex) ? raw.chunkIndex : 0,
    done,
    tempoPct: typeof raw.tempoPct === 'number' && Number.isFinite(raw.tempoPct) ? raw.tempoPct : 100,
    lastPractised: typeof raw.lastPractised === 'string' ? raw.lastPractised : '',
  };
}

export function saveProgress(slug: string, progress: Progress) {
  writeKey(slug, { progress });
}
