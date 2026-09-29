// Mixer model (ADR-0020, system description §5.5): channel values, effective gain, mute, solo and
// the Synth Quick mix presets. Pure; the practice engine applies the gains to the sources and the
// storage module persists the values. Volumes are 0–100 as shown; gains are 0–1.

export interface Channel {
  volume: number; // 0–100 %
  muted: boolean; // keeps `volume`, which comes back on unmute
}

export interface TrackChannel extends Channel {
  solo: boolean;
}

/** Global channels (master, YouTube and Metronome); the Synth tracks are per song. */
export interface GlobalMix {
  master: Channel;
  video: Channel; // YouTube
  click: Channel; // Metronome: tone on every count
  voice: Channel; // Metronome: recorded samples
}

export type GlobalChannelId = keyof GlobalMix;

export const DEFAULT_MIX: GlobalMix = {
  master: { volume: 80, muted: false },
  video: { volume: 100, muted: false },
  click: { volume: 70, muted: false },
  voice: { volume: 100, muted: false },
};

export const DEFAULT_TRACK_VOLUME = 80;

/** Quick mix presets for the Synth, formerly ADR-0019's `SynthMix`. */
export type QuickMix =
  | 'bass' // the bass track only
  | 'band' // every track, bass included
  | 'backing'; // every track except the bass (play along)

export const QUICK_MIXES: { id: QuickMix; label: string }[] = [
  { id: 'bass', label: 'Bass only' },
  { id: 'band', label: 'Full band' },
  { id: 'backing', label: 'Backing' },
];

export const clampVolume = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** A channel's own gain: 0 when muted. */
export function channelGain(ch: Channel): number {
  return ch.muted ? 0 : ch.volume / 100;
}

/** Master × channel, 0 when either is muted. */
export function effectiveGain(master: Channel, ch: Channel): number {
  return channelGain(master) * channelGain(ch);
}

/** Muted, or silenced because another track is soloed. */
export function trackSilenced(tracks: TrackChannel[], index: number): boolean {
  const t = tracks[index];
  if (!t) return true;
  return t.muted || (!t.solo && tracks.some((x) => x.solo));
}

/** A Synth track's gain before master: 0 when muted or silenced by solo. */
export function trackGain(tracks: TrackChannel[], index: number): number {
  return trackSilenced(tracks, index) ? 0 : tracks[index]!.volume / 100;
}

/** Default Synth tracks: 80 % each with the bass soloed ("Bass only"). */
export function defaultTracks(count: number, bassIndex: number): TrackChannel[] {
  return applyQuickMix(
    Array.from({ length: count }, () => ({ volume: DEFAULT_TRACK_VOLUME, muted: false, solo: false })),
    'bass',
    bassIndex,
  );
}

/** Sets solo and mute on every track for a preset; volumes stay. */
export function applyQuickMix(tracks: TrackChannel[], mix: QuickMix, bassIndex: number): TrackChannel[] {
  return tracks.map((t, i) => ({
    volume: t.volume,
    solo: mix === 'bass' && i === bassIndex,
    muted: mix === 'backing' && i === bassIndex,
  }));
}

/** The preset the tracks match, or null after a manual change. */
export function activeQuickMix(tracks: TrackChannel[], bassIndex: number): QuickMix | null {
  if (!tracks.length) return null;
  const matches = (mix: QuickMix) =>
    tracks.every((t, i) => t.solo === (mix === 'bass' && i === bassIndex) && t.muted === (mix === 'backing' && i === bassIndex));
  return QUICK_MIXES.map((q) => q.id).find(matches) ?? null;
}

/** "Artist | Instrument | Role" → title "Role", description "Bass · Artist · Instrument". */
export function trackLabel(name: string): { title: string; description: string } {
  const parts = name.split('|').map((p) => p.trim()).filter(Boolean);
  const title = parts[parts.length - 1] ?? name;
  const low = name.toLowerCase();
  const kind = low.includes('bass')
    ? 'Bass'
    : low.includes('drum')
      ? 'Drums'
      : low.includes('vocal')
        ? 'Vocals'
        : /piano|keys|organ|synth/.test(low)
          ? 'Keys'
          : low.includes('guitar')
            ? 'Guitar'
            : 'Other';
  return { title, description: [kind, ...parts.slice(0, -1)].join(' · ') };
}

/** Value column: "80%", "Muted", or "Off" when another track is soloed. */
export function volumeText(ch: Channel, silenced = ch.muted): string {
  if (ch.muted) return 'Muted';
  return silenced ? 'Off' : `${ch.volume}%`;
}
