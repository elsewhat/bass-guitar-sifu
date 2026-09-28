import { create } from 'zustand';

// Session state (ADR-0002). Playback position is deliberately not stored here; it flows
// through the clock subscription at animation-frame rate (ADR-0008).
export type SourceId = 'youtube' | 'synth' | 'count';

export const SOURCES: { id: SourceId; label: string }[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'synth', label: 'Synth' },
  { id: 'count', label: 'Count' },
];

interface SessionState {
  planOpen: boolean;
  source: SourceId;
  togglePlan: () => void;
  setSource: (source: SourceId) => void;
}

export const useSession = create<SessionState>()((set) => ({
  planOpen: true,
  source: 'count',
  togglePlan: () => set((s) => ({ planOpen: !s.planOpen })),
  setSource: (source) => set({ source }),
}));
