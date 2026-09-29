// The SynthClock's player port over the strip's alphaTab instance (ADR-0019). alphaTab plays the
// whole score's MIDI; the mix (src/playback/synth-mix.ts) picks the tracks with solo and mute.
// Loading a new MIDI into alphaTab's player forgets the playback range, so the range and the mix are
// set again whenever the player reports ready.
import type { SongData } from '../core/model';
import type { TickRange } from '../core/plucks';
import type { SynthPlayer } from '../playback/synth-clock';
import { trackPlayback, type SynthMix } from '../playback/synth-mix';
import type { Strip } from './strip';

export interface SynthPlayerHandle extends SynthPlayer {
  setMix(mix: SynthMix): void;
}

export function createSynthPlayer(strip: Strip, song: SongData, initialMix: SynthMix): SynthPlayerHandle {
  const api = strip.api;
  let mix = initialMix;
  let range: TickRange | null = null;
  let isReady = false;
  const off: (() => void)[] = [];

  const applyMix = () => {
    const tracks = api.score?.tracks;
    if (!tracks) return;
    const { solo, mute } = trackPlayback(mix, tracks.length, song.track.index);
    api.changeTrackSolo(tracks, false);
    api.changeTrackMute(tracks, false);
    if (solo.length) api.changeTrackSolo(solo.map((i) => tracks[i]!), true);
    if (mute.length) api.changeTrackMute(mute.map((i) => tracks[i]!), true);
  };
  const applyRange = () => {
    api.isLooping = true;
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
