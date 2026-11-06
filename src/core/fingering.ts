import type { BeatEvent, Chunk, NoteEvent } from './model';

// Fingering recommendation (ADR-0007): Viterbi over the plucked notes of the whole song.
//
// Model: a hand position p is the fret under the index finger. In low positions (p ≤
// lowZoneMaxPosition) the frets are wide and the hand covers three frets 1-2-4 (the ring finger
// supports the little finger); higher up it covers four frets, one finger per fret. Open
// strings (finger 0) and rests leave the fretting hand free, which makes position shifts there
// cheap. In sparse passages the index finger leads; in dense passages the whole box is used.

export const COSTS = {
  shiftBase: 2, // any position change
  shiftPerFret: 2, // per fret of distance
  freeShiftFactor: 0.25, // shift while the hand is free (open string, rest, dead note)
  guideFactor: 0.75, // shift that slides the same finger along the same string
  retab: 8, // choosing a string/fret other than the source tab (per distinct source)
  stringCross: 0.3, // per string between consecutive notes
  openBonus: 0.5, // open string while the hand is below fret 5
  indexPreference: 1, // sparse passage: per finger rank above the index
  fingerTieBreak: 0.01, // dense passage: finger rank only breaks ties
  roll: 10, // same finger rolled to another string at the same fret; above a shift there and back and a retab (pinky D–G is free)
  heldShift: 100, // moving the hand while a fretted note rings; not playable, but finite so an odd tab still gets a fingering
  denseMinDistinct: 3, // distinct fretted pitches in the current and next bar that make a passage dense
  lowZoneMaxPosition: 5, // highest position that uses the 1-2-4 box
} as const;

const RANK = [0, 0, 1, 2, 3]; // effort per finger 0–4 (index 0 … little 3)

/** Finger that plays `fret` with the index at position p, or null when the fret is outside the box. */
export function boxFinger(fret: number, p: number): number | null {
  const offset = fret - p;
  if (p <= COSTS.lowZoneMaxPosition) return [1, 2, 4][offset] ?? null;
  return offset >= 0 && offset <= 3 ? offset + 1 : null;
}

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
  pitches: number[]; // plucked pitches, lowest first; a pitch doubled on two strings is listed twice
  events: BeatEvent[];
  free: boolean; // the hand was free just before this node
  dense: boolean; // many different fretted notes in this and the next bar
  overrides: FingeringOverride[];
  keep: Map<number, Set<string>>; // pitch → source tabs ("string/fret") it must keep, for notes that ring with others
  holds: boolean; // a fretted note from before still rings: the hand stays, and the index at its fret is a barre
  alternates: boolean; // this node and the one before go back and forth (P–Q–P) without a break: an index barre, not a roll
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
        const c = cost[i - 1]![j]! + transition(prev[j]!, s, nodes[i]!, opts.tuning.length);
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
      // One assignment per note. A pitch doubled on two strings has two: each note keeps its own tab where the state has it.
      const plucked = e.notes.filter((n) => !n.tieFromPrev && !n.dead);
      const slot = new Map<NoteEvent, number>();
      for (const keep of [true, false]) {
        for (const n of plucked) {
          if (slot.has(n)) continue;
          const k = state.assign.findIndex(
            (a, j) => node.pitches[j] === n.pitch && ![...slot.values()].includes(j) && (!keep || (a.string === n.string && a.fret === n.fret)),
          );
          if (k >= 0) slot.set(n, k);
        }
      }
      for (const n of plucked) {
        const a = state.assign[slot.get(n)!]!;
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
  // Fretted pitches per bar, as tabbed in the source.
  const fretted = new Map<number, Set<number>>();
  for (const e of events) {
    for (const n of e.notes) {
      if (n.tieFromPrev || n.dead || n.fret === 0) continue;
      if (!fretted.has(e.bar)) fretted.set(e.bar, new Set());
      fretted.get(e.bar)!.add(n.pitch);
    }
  }
  const dense = (bar: number) => new Set([...(fretted.get(bar) ?? []), ...(fretted.get(bar + 1) ?? [])]).size >= COSTS.denseMinDistinct;

  // Notes that ring together keep the source tab: a held note and the notes plucked while it
  // sounds. The solver does not follow a held note, so a re-tab could put two notes on one string.
  const ringing = new Set<NoteEvent>();
  const sounding = new Map<number, NoteEvent>(); // source string → last plucked note on it
  for (const e of events) {
    const held = e.notes.filter((n) => n.tieFromPrev && !n.dead);
    const plucked = e.notes.filter((n) => !n.tieFromPrev && !n.dead);
    if (held.length > 0 && plucked.length > 0) {
      for (const n of plucked) ringing.add(n);
      for (const n of held) {
        const origin = sounding.get(n.string);
        if (origin) ringing.add(origin);
      }
    }
    for (const n of plucked) sounding.set(n.string, n);
  }

  const nodes: Node[] = [];
  let free = true;
  for (const e of events) {
    const plucked = e.notes.filter((n) => !n.tieFromPrev && !n.dead);
    if (e.kind === 'rest' || (plucked.length === 0 && e.notes.every((n) => n.dead))) {
      free = true;
      continue;
    }
    if (plucked.length === 0) continue; // tie continuation: the hand keeps holding
    const pitches = plucked.map((n) => n.pitch).sort((a, b) => a - b);
    const ov = overrides.filter((o) => o.bar === e.bar && o.tick === e.tick);
    // Repeated identical notes keep the same fingering: collapse them into one node. A rest in
    // between keeps them apart, so a sparse passage can settle on the index finger (micro-shift).
    let node = nodes[nodes.length - 1];
    if (!node || free || node.pitches.join() !== pitches.join()) {
      const holds = e.notes.some((n) => n.tieFromPrev && !n.dead && n.fret > 0);
      node = { pitches, events: [], free, dense: dense(e.bar), overrides: [], keep: new Map(), holds, alternates: false };
      nodes.push(node);
    }
    node.events.push(e);
    node.overrides.push(...ov);
    for (const n of plucked) {
      if (!ringing.has(n)) continue;
      if (!node.keep.has(n.pitch)) node.keep.set(n.pitch, new Set());
      node.keep.get(n.pitch)!.add(`${n.string}/${n.fret}`);
    }
    free = false;
  }

  // Notes that go back and forth without a break (P–Q–P): the index laid across both strings at the
  // same fret is a barre, not a roll (rule 6, owner 2026-11-05). A single step is still a roll.
  const same = (a?: Node, b?: Node) => !!a && !!b && a.pitches.join() === b.pitches.join();
  nodes.forEach((node, i) => {
    const prev = nodes[i - 1];
    const next = nodes[i + 1];
    node.alternates =
      !node.free && !!prev && !same(prev, node) && ((!prev.free && same(nodes[i - 2], node)) || (!!next && !next.free && same(next, prev)));
  });
  return nodes;
}

function candidates(node: Node, opts: FingeringOptions): State[] {
  const { tuning, maxFret } = opts;
  // Alternatives per pitch: every (string, fret) that sounds it, or only the source tab for a note that rings with others.
  const alts: { string: number; fret: number }[][] = node.pitches.map((pitch) =>
    tuning.flatMap((open, string) => {
      const fret = pitch - open;
      const keep = node.keep.get(pitch);
      return fret >= 0 && fret <= maxFret && (!keep || keep.has(`${string}/${fret}`)) ? [{ string, fret }] : [];
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
    // A doubled pitch: one order of its two strings (the swapped order is the same chord).
    if (combo.some((c, i) => i > 0 && node.pitches[i] === node.pitches[i - 1] && c.string < combo[i - 1]!.string)) continue;
    const fretted = combo.filter((c) => c.fret > 0).map((c) => c.fret);
    const allOpen = fretted.length === 0;
    const pMin = allOpen ? 1 : Math.max(1, Math.max(...fretted) - 3);
    const pMax = allOpen ? Math.max(1, maxFret) : Math.min(...fretted);
    const fingerWeight = node.dense ? COSTS.fingerTieBreak : COSTS.indexPreference;
    for (let p = pMin; p <= pMax; p++) {
      const fingers = combo.map((c) => (c.fret === 0 ? 0 : boxFinger(c.fret, p)));
      if (fingers.some((f) => f === null)) continue;
      const assign = combo.map((c, i) => ({ ...c, finger: fingers[i]! }));
      if (!node.overrides.every((o) => assign.some((a) => matches(a, o)))) continue;
      let local = 0;
      assign.forEach((a, i) => {
        if (node.pitches[i - 1] !== node.pitches[i]) {
          // Source tabs of this pitch that no note of it keeps (counted once for a doubled pitch).
          const kept = assign.filter((_, j) => node.pitches[j] === node.pitches[i]).map((b) => `${b.string}/${b.fret}`);
          local += COSTS.retab * [...sources[i]!].filter((s) => !kept.includes(s)).length;
        }
        if (a.finger > 0) local += fingerWeight * RANK[a.finger]!;
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

function transition(a: State, b: State, node: Node, strings: number): number {
  const { free, holds, alternates } = node;
  let c = 0;
  const pairs = a.assign.flatMap((x) => b.assign.filter((y) => x.finger > 0 && y.finger === x.finger).map((y) => [x, y] as const));
  if (a.p !== b.p) {
    let shift = COSTS.shiftBase + COSTS.shiftPerFret * Math.abs(a.p - b.p);
    if (free || a.allOpen || b.allOpen) shift *= COSTS.freeShiftFactor;
    if (pairs.some(([x, y]) => x.string === y.string)) shift *= COSTS.guideFactor; // guide finger
    if (holds) shift += COSTS.heldShift;
    c += shift;
  }
  c += COSTS.stringCross * Math.abs(a.assign[0]!.string - b.assign[0]!.string);
  if (!free) {
    // Rolling one finger to another string at the same fret; only the little finger between the top two
    // strings, and the index laid across both strings (a barre) under a held note or for notes that go
    // back and forth.
    for (const [x, y] of pairs) {
      if (x.fret !== y.fret || x.string === y.string) continue;
      const topPair = x.finger === 4 && Math.abs(x.string - y.string) === 1 && Math.min(x.string, y.string) >= strings - 2;
      const barre = (holds || alternates) && x.finger === 1;
      if (!topPair && !barre) c += COSTS.roll;
    }
  }
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
