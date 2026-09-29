// Which tracks of the Guitar Pro file the Synth source plays (ADR-0019). alphaTab generates MIDI
// for every track, so a mix is a set of tracks to solo or mute. Version 1 plays the bass alone;
// the other modes are ready for a future switch.
export type SynthMix =
  | 'bass' // the bass track only
  | 'band' // every track, bass included
  | 'backing'; // every track except the bass (play along)

export interface TrackPlayback {
  solo: number[];
  mute: number[];
}

/** Track indexes to solo and mute for a mix; every other track plays normally. */
export function trackPlayback(mix: SynthMix, trackCount: number, bassIndex: number): TrackPlayback {
  if (bassIndex < 0 || bassIndex >= trackCount) return { solo: [], mute: [] };
  if (mix === 'bass') return { solo: [bassIndex], mute: [] };
  if (mix === 'backing') return { solo: [], mute: [bassIndex] };
  return { solo: [], mute: [] };
}
