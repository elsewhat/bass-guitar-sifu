// Loading the Guitar Pro file in the browser for alphaTab rendering (ADR-0017): applies the
// fingering solver's re-tabs so the tab shows where the player is told to play, and colours
// fret numbers and note heads by string (ADR-0009).
import * as alphaTab from '@coderline/alphatab';
import type { SongData } from '../core/model';

/** String colours from the `--string-1..4` variables (ADR-0009), lowest string first. */
export function stringPalette(): { fill: string[]; text: string[] } {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return {
    fill: [1, 2, 3, 4].map((i) => read(`--string-${i}`)),
    text: [1, 2, 3, 4].map((i) => read(`--string-${i}-text`)),
  };
}

export async function fetchScore(song: SongData, settings: alphaTab.Settings): Promise<alphaTab.model.Score> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/scores/${song.slug}.gp`);
  if (!res.ok) throw new Error(`Could not load score for ${song.slug}: ${res.status}`);
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(await res.arrayBuffer()), settings);
  const track = score.tracks[song.track.index];
  if (!track || track.name !== song.track.name) throw new Error(`Track ${song.track.index} is not "${song.track.name}"`);
  applyRetabs(track, song);
  return score;
}

/** Moves re-tabbed notes to the solver's string/fret (matched by bar, tick, source string and fret). */
export function applyRetabs(track: alphaTab.model.Track, song: SongData) {
  const byPosition = new Map(song.events.map((e) => [`${e.bar}:${e.tick}`, e]));
  for (const bar of track.staves[0]!.bars) {
    for (const beat of bar.voices[0]?.beats ?? []) {
      const event = byPosition.get(`${bar.index + 1}:${beat.playbackStart}`);
      if (!event) continue;
      for (const note of beat.notes) {
        const target = event.notes.find(
          (n) => (n.retabFrom?.string ?? n.string) === note.string - 1 && (n.retabFrom?.fret ?? n.fret) === note.fret,
        );
        if (target?.retabFrom) {
          note.string = target.string + 1;
          note.fret = target.fret;
        }
      }
    }
  }
}

/** Per-note colours: tab fret number in the string's text colour (drawn on a string-coloured circle). */
export function colourNotes(track: alphaTab.model.Track, fretNumberColour: (stringIndex: number) => string) {
  const { NoteStyle, NoteSubElement, Color } = alphaTab.model;
  for (const bar of track.staves[0]!.bars) {
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        for (const note of beat.notes) {
          const style = new NoteStyle();
          style.colors.set(NoteSubElement.GuitarTabFretNumber, Color.fromJson(fretNumberColour(note.string - 1)));
          note.style = style;
        }
      }
    }
  }
}
