import { create } from 'zustand';
import type { CatalogEntry, SongData } from '../core/model';
import { initialLoop, type LoopState } from '../playback/loop';
import type { SynthMix } from '../playback/synth-mix';

// Session state (ADR-0002). Playback position is deliberately not stored here; it flows
// through the clock subscription at animation-frame rate (ADR-0008). Pass and chunk changes
// are discrete and live here; the practice engine (src/practice/engine.ts) writes them.
export type SourceId = 'youtube' | 'synth' | 'count';

export const SOURCES: { id: SourceId; label: string; ready: boolean }[] = [
  { id: 'youtube', label: 'YouTube', ready: false },
  { id: 'synth', label: 'Synth', ready: true },
  { id: 'count', label: 'Count', ready: true },
];

/** Loading state of the active source (the Synth loads alphaTab's player and a soundfont). */
export interface SourceStatus {
  state: 'ready' | 'loading' | 'error';
  progress?: number; // 0–1, soundfont download
  error?: string;
}

export const TEMPO = { min: 40, max: 120, step: 5, start: 75 } as const;

export interface SessionState extends LoopState {
  planOpen: boolean;
  source: SourceId;
  sourceStatus: SourceStatus;
  /** Tracks the Synth plays (ADR-0019); no switch in the UI yet. */
  synthMix: SynthMix;
  catalog: CatalogEntry[];
  song: SongData | null;
  loadError: string | null;
  tempoPct: number;
  playing: boolean;
  togglePlan: () => void;
}

export const useSession = create<SessionState>()((set) => ({
  ...initialLoop(),
  planOpen: true,
  source: 'count',
  sourceStatus: { state: 'ready' },
  synthMix: 'bass',
  catalog: [],
  song: null,
  loadError: null,
  tempoPct: TEMPO.start,
  playing: false,
  togglePlan: () => set((s) => ({ planOpen: !s.planOpen })),
}));
