import type { BeatEvent, Chunk, NoteEvent } from './model';

// Fingering recommendation (ADR-0007): Viterbi over the plucked notes of the whole song.
//
// Model: one finger per fret inside a 4-fret hand position p (fret under the index finger),
// so a fretted note at fret f with finger k means p = f − k + 1. Open strings (finger 0) and
// rests leave the fretting hand free, which makes position shifts there cheap.

export const COSTS = {
  shiftBase: 2, // any position change
  shiftPerFret: 2, // per fret of distance
  freeShiftFactor: 0.25, // shift while the hand is free (open string, rest, dead note)
  retab: 6, // choosing a string/fret other than the source tab (per distinct source)
  stringCross: 0.3, // per string between consecutive notes
  openBonus: 0.5, // open string while the hand is below fret 5
  fingerTieBreak: 0.01, // per finger above the index: prefer leading with the index finger
} as const;

export interface FingeringOverride {
  bar: number;
  tick: number;
  string?: number;
  fret?: number;
  finger?: number;
}

export interface FingeringOptions {
  tuning: number[]; // lowest string first
  maxFret: number; // highest fret the solver may use
  overrides?: FingeringOverride[];
}

interface Assign {
  string: number;
  fret: number;
  finger: number; // 0 = open
}

interface State {
  p: number;
  assign: Assign[]; // one per pitch in the node, same order as node.pitches
  allOpen: boolean;
  local: number; // node-local cost
}

interface Node {
  pitches: number[];
  events: BeatEvent[];
  free: boolean; // the hand was free just before this node
  overrides: FingeringOverride[];
}

/** Assigns finger, position and retabFrom to every note. Returns a new events array. */
export function solveFingering(events: BeatEvent[], opts: FingeringOptions): BeatEvent[] {
  const out = events.map((e) => ({ ...e, notes: e.notes.map((n) => ({ ...n })) }));
  const nodes = buildNodes(out, opts.overrides ?? []);
  if (nodes.length === 0) return out;

  const states = nodes.map((node) => candidates(node, opts));
  // Viterbi.
  const cost: number[][] = [states[0]!.map((s) => s.local)];
  const back: number[][] = [states[0]!.map(() => -1)];
  for (let i = 1; i < nodes.length; i++) {
    const prev = states[i - 1]!;
    const row: number[] = [];
    const brow: number[] = [];
    for (const s of states[i]!) {
      let best = Infinity;
      let arg = -1;
      for (let j = 0; j < prev.length; j++) {
        const c = cost[i - 1]![j]! + transition(prev[j]!, s, nodes[i]!.free);
        if (c < best) {
          best = c;
          arg = j;
        }
      }
      row.push(best + s.local);
      brow.push(arg);
    }
    cost.push(row);
    back.push(brow);
  }
  const last = cost[cost.length - 1]!;
  let k = last.indexOf(Math.min(...last));
  const chosen: State[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    chosen[i] = states[i]![k]!;
    k = back[i]![k]!;
  }

  // Write back, then let tie continuations and dead notes follow.
  nodes.forEach((node, i) => {
    const state = chosen[i]!;
    for (const e of node.events) {
      for (const n of e.notes) {
        if (n.tieFromPrev || n.dead) continue;
        const a = state.assign[node.pitches.indexOf(n.pitch)]!;
        if (a.string !== n.string || a.fret !== n.fret) n.retabFrom = { string: n.string, fret: n.fret };
        n.string = a.string;
        n.fret = a.fret;
        n.finger = a.finger;
        n.position = a.finger === 0 ? null : state.p;
      }
    }
  });
  followTies(out);
  return out;
}

function buildNodes(events: BeatEvent[], overrides: FingeringOverride[]): Node[] {
  const nodes: Node[] = [];
  let free = true;
  for (const e of events) {
    const plucked = e.notes.filter((n) => !n.tieFromPrev && !n.dead);
    if (e.kind === 'rest' || (plucked.length === 0 && e.notes.every((n) => n.dead))) {
      free = true;
      continue;
    }
    if (plucked.length === 0) continue; // tie continuation: the hand keeps holding
    const pitches = [...new Set(plucked.map((n) => n.pitch))].sort((a, b) => a - b);
    const ov = overrides.filter((o) => o.bar === e.bar && o.tick === e.tick);
    const prev = nodes[nodes.length - 1];
    // Repeated identical notes keep the same fingering: collapse them into one node.
    if (prev && !free && prev.pitches.join() === pitches.join()) {
      prev.events.push(e);
      prev.overrides.push(...ov);
    } else {
      nodes.push({ pitches, events: [e], free, overrides: ov });
    }
    free = false;
  }
  return nodes;
}

function candidates(node: Node, opts: FingeringOptions): State[] {
  const { tuning, maxFret } = opts;
  // Alternatives per pitch: every (string, fret) that sounds it.
  const alts: { string: number; fret: number }[][] = node.pitches.map((pitch) =>
    tuning.flatMap((open, string) => {
      const fret = pitch - open;
      return fret >= 0 && fret <= maxFret ? [{ string, fret }] : [];
    }),
  );
  // Source tab positions per pitch in this node (for the retab cost).
  const sources = node.pitches.map(
    (pitch) =>
      new Set(
        node.events.flatMap((e) => e.notes.filter((n) => n.pitch === pitch && !n.tieFromPrev && !n.dead).map((n) => `${n.string}/${n.fret}`)),
      ),
  );

  const states: State[] = [];
  for (const combo of cartesian(alts)) {
    if (new Set(combo.map((c) => c.string)).size !== combo.length) continue; // one note per string
    const fretted = combo.filter((c) => c.fret > 0).map((c) => c.fret);
    const allOpen = fretted.length === 0;
    const pMin = allOpen ? 1 : Math.max(1, Math.max(...fretted) - 3);
    const pMax = allOpen ? Math.max(1, maxFret) : Math.min(...fretted);
    for (let p = pMin; p <= pMax; p++) {
      const assign = combo.map((c) => ({ ...c, finger: c.fret === 0 ? 0 : c.fret - p + 1 }));
      if (!node.overrides.every((o) => assign.some((a) => matches(a, o)))) continue;
      let local = 0;
      assign.forEach((a, i) => {
        const src = sources[i]!;
        local += COSTS.retab * [...src].filter((s) => s !== `${a.string}/${a.fret}`).length;
        if (a.finger > 0) local += COSTS.fingerTieBreak * (a.finger - 1);
        else if (p < 5) local -= COSTS.openBonus;
      });
      states.push({ p, assign, allOpen, local });
    }
  }
  if (states.length === 0) {
    const where = node.events[0]!;
    throw new Error(`No playable fingering for bar ${where.bar} tick ${where.tick} (pitches ${node.pitches.join(', ')}); check fingeringOverrides`);
  }
  return states;
}

function transition(a: State, b: State, free: boolean): number {
  let c = 0;
  if (a.p !== b.p) {
    const shift = COSTS.shiftBase + COSTS.shiftPerFret * Math.abs(a.p - b.p);
    c += free || a.allOpen || b.allOpen ? shift * COSTS.freeShiftFactor : shift;
  }
  c += COSTS.stringCross * Math.abs(a.assign[0]!.string - b.assign[0]!.string);
  return c;
}

function matches(a: Assign, o: FingeringOverride): boolean {
  return (o.string === undefined || o.string === a.string) && (o.fret === undefined || o.fret === a.fret) && (o.finger === undefined || o.finger === a.finger);
}

/** Tied continuations copy the note they continue; dead notes stay on their tab, unfingered. */
function followTies(events: BeatEvent[]) {
  const sounding = new Map<number, NoteEvent>(); // source string → last plucked note on it
  for (const e of events) {
    for (const n of e.notes) {
      if (n.dead) {
        n.finger = null;
        n.position = null;
        continue;
      }
      if (n.tieFromPrev) {
        const origin = sounding.get(n.string);
        if (origin) {
          if (origin.retabFrom) n.retabFrom = { string: n.string, fret: n.fret };
          n.string = origin.string;
          n.fret = origin.fret;
          n.finger = origin.finger;
          n.position = origin.position;
        }
        continue;
      }
      sounding.set(n.retabFrom?.string ?? n.string, n);
    }
  }
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])), [[]]);
}

/** Chunk summary: most used hand position and number of position changes. */
export function chunkPositions(events: BeatEvent[], bars: [number, number]): Pick<Chunk, 'position' | 'shifts'> {
  const positions = events
    .filter((e) => e.bar >= bars[0] && e.bar <= bars[1])
    .flatMap((e) => e.notes.filter((n) => !n.tieFromPrev && n.position !== null).map((n) => n.position!));
  if (positions.length === 0) return { position: null, shifts: 0 };
  const counts = new Map<number, number>();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  const position = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  let shifts = 0;
  for (let i = 1; i < positions.length; i++) if (positions[i] !== positions[i - 1]) shifts++;
  return { position, shifts };
}
