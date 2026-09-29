// Per-song lookups derived once from the song JSON and shared by the practice components.
import type { BeatEvent, SongData } from '../core/model';
import { buildPlucks, type Pluck } from '../core/plucks';
import { tempoLookup, type TempoLookup } from '../core/timing';

export interface SongModel {
  plucks: Pluck[];
  /** Note events in time order, tie continuations included (the tab ring moves onto them). */
  noteEvents: BeatEvent[];
  tempo: TempoLookup;
}

const cache = new WeakMap<SongData, SongModel>();

export function songModel(song: SongData): SongModel {
  let model = cache.get(song);
  if (!model) {
    model = {
      plucks: buildPlucks(song.events),
      noteEvents: song.events.filter((e) => e.kind === 'note').sort((a, b) => a.start - b.start),
      tempo: tempoLookup(song.tempoMap, song.bars),
    };
    cache.set(song, model);
  }
  return model;
}
