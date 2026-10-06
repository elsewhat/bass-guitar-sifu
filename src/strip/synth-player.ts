// The SynthClock's player port over the strip's alphaTab instance (ADR-0019). alphaTab plays the
// whole score's MIDI; the mixer (ADR-0020, src/playback/mixer.ts) sets each track's volume, mute
// and solo, and the master through `masterVolume`. Loading a new MIDI into alphaTab's player
// forgets the playback range, so the range and the mix are set again whenever the player reports ready.
import type { SongData } from '../core/model';
import type { TickRange } from '../core/plucks';
import type { SynthPlayer } from '../playback/synth-clock';
import type { TrackChannel } from '../playback/mixer';
import type { Strip } from './strip';

/** Master gain 0–1 (0 when muted) and the song's track channels, by track index. */
export interface SynthLevels {
  master: number;
  tracks: TrackChannel[];
}

export interface SynthPlayerHandle extends SynthPlayer {
  setMix(mix: SynthLevels): void;
}

export function createSynthPlayer(strip: Strip, song: SongData, initialMix: SynthLevels): SynthPlayerHandle {
  const api = strip.api;
  let mix = initialMix;
  let range: TickRange | null = null;
  let looping = true;
  let isReady = false;
  const off: (() => void)[] = [];

  const applyMix = () => {
    const tracks = api.score?.tracks;
    if (!tracks) return;
    api.masterVolume = mix.master;
    tracks.forEach((track, i) => {
      const ch = mix.tracks[i];
      if (!ch) return;
      api.changeTrackVolume([track], ch.volume / 100); // 1 = the volume in the file
      api.changeTrackSolo([track], ch.solo);
      api.changeTrackMute([track], ch.muted);
    });
  };
  const applyRange = () => {
    api.isLooping = looping;
    if (range) api.playbackRange = { startTick: range.start, endTick: range.end };
  };

  const ready = new Promise<void>((resolve, reject) => {
    const check = () => {
      if (!strip.synthReadyFor(song)) return;
      applyMix();
      if (isReady) applyRange(); // a reloaded MIDI (the clock sets the range on first ready)
      isReady = true;
      resolve();
    };
    off.push(strip.onSynthUpdate(check), api.error.on((e) => reject(e)));
    check();
  });

  return {
    ready,
    play: () => void api.play(),
    pause: () => api.pause(),
    seek: (tick) => (api.tickPosition = tick),
    setSpeed: (rate) => (api.playbackSpeed = rate),
    setRange(r) {
      range = r;
      applyRange();
    },
    setLooping(l) {
      looping = l;
      api.isLooping = l;
    },
    onPosition: (listener) => api.playerPositionChanged.on((e) => listener(e.currentTick, e.isSeek)),
    onWrap: (listener) => api.playerFinished.on(listener),
    setMix(m) {
      mix = m;
      if (isReady) applyMix();
    },
    dispose() {
      for (const o of off) o();
    },
  };
}
