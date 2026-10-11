// Per-song lookups derived once from the song JSON and shared by the practice components.
import type { BeatEvent, SongData } from '../core/model';
import { buildPlucks, type Pluck } from '../core/plucks';
import { syncMap, type SyncMap } from '../core/sync';
import { tempoLookup, type TempoLookup } from '../core/timing';

export interface SongModel {
  plucks: Pluck[];
  /** Note events in time order, tie continuations included (the tab ring moves onto them). */
  noteEvents: BeatEvent[];
  tempo: TempoLookup;
  /** Score position ↔ video time of the YouTube video (ADR-0028); null for a song without one. */
  video: SyncMap | null;
}

const cache = new WeakMap<SongData, SongModel>();

export function songModel(song: SongData): SongModel {
  let model = cache.get(song);
  if (!model) {
    const tempo = tempoLookup(song.tempoMap, song.bars);
    model = {
      plucks: buildPlucks(song.events),
      noteEvents: song.events.filter((e) => e.kind === 'note').sort((a, b) => a.start - b.start),
      tempo,
      video: song.media.youtube?.videoId ? syncMap(song.media.youtube.sync, song.bars, tempo) : null,
    };
    cache.set(song, model);
  }
  return model;
}
