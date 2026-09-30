// Pluck timeline for the visual metronome, fretboard and Now/Next squares (system description
// §3.5, §5.2). A pluck is a note onset: tie continuations extend the previous pluck instead of
// starting a new one, so a tied note fades over its whole length. A double stop or chord is one
// pluck with several notes.
import { chordName } from './chord-name';
import type { BeatEvent, NoteEvent } from './model';

export interface TickRange {
  start: number; // absolute tick, inclusive
  end: number; // absolute tick, exclusive
}

export interface PluckNote {
  string: number;
  fret: number;
  dead: boolean;
  finger: number | null; // 0 = open string, null = dead note
}

export interface Pluck {
  index: number;
  eventId: number;
  bar: number;
  start: number; // absolute tick
  dur: number; // ticks, including tied continuations
  string: number; // primary note: the lowest string of a double stop
  fret: number;
  dead: boolean;
  finger: number | null; // 0 = open string, null = dead note
  position: number; // hand position; open and dead notes borrow it from their neighbours
  notes: PluckNote[]; // every plucked note, highest string first (one for a single note)
  chord: string | null; // "D5" for a power chord, else null (chord-name.ts)
}

/** Plucks in time order. */
export function buildPlucks(events: BeatEvent[]): Pluck[] {
  const plucks: Pluck[] = [];
  const sorted = [...events].sort((a, b) => a.start - b.start);
  for (const e of sorted) {
    if (e.kind !== 'note') continue;
    const onsets = e.notes.filter((n) => !n.tieFromPrev);
    const last = plucks[plucks.length - 1];
    if (!onsets.length) {
      if (last && e.start <= last.start + last.dur) last.dur = e.start + e.dur - last.start;
      continue;
    }
    const n = onsets.reduce((a: NoteEvent, b) => (b.string < a.string ? b : a));
    const notes = [...onsets].sort((a, b) => b.string - a.string);
    plucks.push({
      index: plucks.length,
      eventId: e.id,
      bar: e.bar,
      start: e.start,
      dur: e.dur,
      string: n.string,
      fret: n.fret,
      dead: n.dead,
      finger: n.finger,
      // A chord's hand is where its fretted notes are, even when its lowest note is open.
      position: notes.find((o) => o.position)?.position ?? 0,
      notes: notes.map((o) => ({ string: o.string, fret: o.fret, dead: o.dead, finger: o.finger })),
      chord: chordName(notes.filter((o) => !o.dead).map((o) => o.pitch)),
    });
  }
  // Open and dead notes keep the hand where the next fretted note needs it (else the previous one).
  let next = 0;
  for (let i = plucks.length - 1; i >= 0; i--) {
    const p = plucks[i]!;
    if (p.position) next = p.position;
    else p.position = next;
  }
  let prev = 1;
  for (const p of plucks) {
    if (p.position) prev = p.position;
    else p.position = prev;
  }
  return plucks;
}

/** Index of the last pluck starting at or before the tick, or -1. */
export function lastPluckIndex(plucks: Pluck[], tick: number): number {
  let lo = 0;
  let hi = plucks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plucks[mid]!.start <= tick) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The pluck sounding at a tick, or null during rests. */
export function pluckAt(plucks: Pluck[], tick: number): Pluck | null {
  const p = plucks[lastPluckIndex(plucks, tick)];
  return p && tick < p.start + p.dur ? p : null;
}

/** Same notes on the same strings; for a chord every note counts. */
export function sameNote(a: Pluck, b: Pluck): boolean {
  return a.notes.length === b.notes.length && a.notes.every((n, i) => {
    const o = b.notes[i]!;
    return n.string === o.string && n.fret === o.fret && n.dead === o.dead;
  });
}

/** First pluck inside a range. */
export function firstPluckIn(plucks: Pluck[], range: TickRange): Pluck | null {
  const i = lastPluckIndex(plucks, range.start - 1) + 1;
  const p = plucks[i];
  return p && p.start < range.end ? p : null;
}

export interface NextNote {
  pluck: Pluck;
  /** "in 6" = six plucks until the change; "loop" and "next chunk" wrap around the range. */
  when: string;
}

/**
 * The next *different* note after the tick (not the next pluck). Inside the loop range it is
 * "in N" plucks away; when nothing changes before the range end it is the first note of the
 * range ("loop") or of the next range ("next chunk") when the loop is about to advance.
 */
export function nextDifferentNote(
  plucks: Pluck[],
  tick: number,
  range: TickRange,
  advanceTo: TickRange | null,
): NextNote | null {
  const i = lastPluckIndex(plucks, tick);
  const current = pluckAt(plucks, tick);
  for (let j = i + 1; j < plucks.length && plucks[j]!.start < range.end; j++) {
    const p = plucks[j]!;
    if (!current || !sameNote(p, current)) return { pluck: p, when: `in ${j - i}` };
  }
  const wrap = firstPluckIn(plucks, advanceTo ?? range);
  return wrap ? { pluck: wrap, when: advanceTo ? 'next chunk' : 'loop' } : null;
}
