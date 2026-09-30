import { create } from 'zustand';
import type { CatalogEntry, SongData } from '../core/model';
import { DEFAULT_REPEAT_MODE, initialLoop, type LoopState } from '../playback/loop';
import { DEFAULT_MIX, type GlobalMix, type TrackChannel } from '../playback/mixer';
import { loadSettings } from './storage';

// Session state (ADR-0002). Playback position is deliberately not stored here; it flows
// through the clock subscription at animation-frame rate (ADR-0008). Pass and chunk changes
// are discrete and live here; the practice engine (src/practice/engine.ts) writes them.
export type SourceId = 'youtube' | 'synth' | 'music' | 'count';

export const SOURCES: { id: SourceId; label: string; ready: boolean }[] = [
  { id: 'youtube', label: 'YouTube', ready: false },
  { id: 'synth', label: 'Synth', ready: true },
  { id: 'music', label: 'Music', ready: true },
  { id: 'count', label: 'Metronome', ready: true },
];

/** Whether a source can be chosen for a song: Music needs the song's rendered MP3 (ADR-0022). */
export function sourceAvailable(id: SourceId, song: SongData | null): boolean {
  const ready = SOURCES.find((s) => s.id === id)?.ready ?? false;
  return ready && (id !== 'music' || !!song?.media.music);
}

/** Music plays at full speed only (ADR-0022); the chosen tempo is kept for the other sources. */
export const tempoLocked = (source: SourceId) => source === 'music';

/** The tempo in effect: 100 % while the tempo is locked, else the chosen one. */
export const effectiveTempo = (s: { source: SourceId; tempoPct: number }) => (tempoLocked(s.source) ? 100 : s.tempoPct);

/** Loading state of the active source (the Synth loads alphaTab's player and a soundfont). */
export interface SourceStatus {
  state: 'ready' | 'loading' | 'error';
  progress?: number; // 0–1, soundfont or MP3 download
  error?: string;
}

export const TEMPO = { min: 40, max: 100, step: 5, start: 100 } as const;

export interface SessionState extends LoopState {
  planOpen: boolean;
  source: SourceId;
  sourceStatus: SourceStatus;
  /** Master, YouTube, Music and Metronome channels (ADR-0020), kept in the browser. */
  mixer: GlobalMix;
  /** The current song's Synth track channels, by track index (ADR-0020). */
  synthTracks: TrackChannel[];
  /** Whether the recorded count samples exist; null until checked. */
  voiceSamples: boolean | null;
  mixerOpen: boolean;
  /** Lyrics view in the video cell, for songs with lyrics (ADR-0024). */
  lyricsOn: boolean;
  libraryOpen: boolean;
  catalog: CatalogEntry[];
  song: SongData | null;
  loadError: string | null;
  tempoPct: number;
  playing: boolean;
  togglePlan: () => void;
}

const settings = loadSettings();

export const useSession = create<SessionState>()((set) => ({
  ...initialLoop(3, settings.repeatMode ?? DEFAULT_REPEAT_MODE),
  planOpen: true,
  source: 'count',
  sourceStatus: { state: 'ready' },
  mixer: settings.mixer ?? DEFAULT_MIX,
  synthTracks: [],
  voiceSamples: null,
  mixerOpen: false,
  lyricsOn: settings.lyricsOn ?? true,
  libraryOpen: false,
  catalog: [],
  song: null,
  loadError: null,
  tempoPct: TEMPO.start,
  playing: false,
  togglePlan: () => set((s) => ({ planOpen: !s.planOpen })),
}));
