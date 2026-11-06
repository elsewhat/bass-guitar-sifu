# ADR-0007: Fingering recommendation

Status: Accepted
Date: 2026-09-28
Revised: 2026-09-29 (beginner rules: hand box, sparse and dense passages, breaks, rolling)
Revised: 2026-11-05 (a pitch doubled on two strings; notes that ring together; an index barre for notes that go back and forth, owner)

## Context

Every note shows a recommended fretting finger. The recommendation should keep the hand in one position for as long as possible, which requires looking ahead across the chunk and into the next chunk. Tabs from third parties sometimes place the same pitch on different strings in consecutive bars for no reason relevant to a learner (Vortex Surfer bar 169 uses E-string fret 7 for B, where the bars around it use A-string fret 2).

The app is for beginners. The owner's rules for a beginner's fretting hand:

1. **Dense passages use the whole hand.** When the current and next bar hold many different fretted notes, all fingers are used and each finger has its natural frets.
2. **Sparse passages lead with the index finger.** Example: the Vortex Surfer chugging, one pitch per bar.
3. **The little finger covers the far end of the reach, in both directions,** when the next note follows with little or no break:
   - before a descent, the current note takes the little finger so the lower note falls under the index;
   - on an ascent, the index stays and the little finger reaches up.
4. **Breaks allow micro-shifts.** When there is a break, the hand may move a fret or two so the index plays the next note.
5. **The little finger reaches two frets from the index in low positions,** where the frets are wide. The ring finger supports it (Simandl 1-2-4). Higher up it is one finger per fret.
6. **No finger rolling,** meaning the same finger at the same fret moved to another string for the next note. The one exception is the little finger between the two top strings (D and G).
   - **Exception (owner, 2026-11-05): an index barre** when two notes at the same fret go back and forth without a break (root and fifth, or an octave in drop D). The index lies across both strings. A single step to the same fret on another string is still a roll.

## Decision

Dynamic programming (Viterbi) over the plucked notes of the whole song, not per chunk, so the next chunk is planned for. The costs are constants in one module (`COSTS` in `src/core/fingering.ts`).

### Algorithm

```
constants (COSTS)
  shiftBase          = 2      # any position change
  shiftPerFret       = 2      # per fret of distance
  freeShiftFactor    = 0.25   # shift in a break (rule 4)
  guideFactor        = 0.75   # shift that slides the same finger along the same string
  retab              = 8      # per distinct source (string, fret) the note moves away from
  stringCross        = 0.3    # per string between consecutive notes
  openBonus          = 0.5    # open string while the hand is below fret 5
  indexPreference    = 1      # sparse passage: cost per finger rank (rule 2)
  fingerTieBreak     = 0.01   # dense passage: finger rank only breaks ties (rule 1)
  roll               = 10     # rolling (rule 6); above a shift there and back and a retab
  heldShift          = 100    # moving the hand while a fretted note rings; finite so an odd tab still solves
  denseMinDistinct   = 3      # distinct fretted pitches in bars b and b+1 that make a passage dense
  lowZoneMaxPosition = 5      # positions 1–5 use the 1-2-4 box (rule 5)

position p = the fret under the index finger

box(p):                                   # fret → finger
  p ≤ lowZoneMaxPosition:  { p: 1, p+1: 2, p+2: 4 }            # ring finger supports the little finger
  otherwise:               { p: 1, p+1: 2, p+2: 3, p+3: 4 }

rank(finger) = { 1: 0, 2: 1, 3: 2, 4: 3 }  # effort

nodes:
  one node per plucked beat (tie continuations and dead notes are not plucked)
  consecutive identical beats collapse into one node (repeated notes keep their fingering),
    unless a rest separates them
  node.free  = a rest or a dead-only beat comes right before it
  node.dense = |fretted source pitches in bar(node) ∪ bar(node)+1| ≥ denseMinDistinct
  node.pitches lists a pitch twice when the beat doubles it on two strings (a D chord on A5 and the open D)
  node.holds = a fretted note from an earlier beat still rings (a tie continuation in the beat)
  ringing notes = a held note's plucked origin, and every note plucked while a note is held
  node.alternates = no rest before it, and the node two back has its pitches, or the next node (no rest
    before it) has the previous node's pitches: P–Q–P

candidates(node):                          # states
  for every combination of (string, fret) that sounds the node's pitches, one note per string,
      frets 0..maxFret, ringing notes only on their source (string, fret):
    for p in [max(1, highest fret − 3) .. lowest fretted fret]   (any p when all notes are open)
      skip unless every fretted note is in box(p); finger = box(p)[fret], open string = 0
      skip unless the sidecar overrides for this beat match
      local = retab · (number of source (string, fret) this node moves away from)
            + Σ fretted notes: (node.dense ? fingerTieBreak : indexPreference) · rank(finger)
            − Σ open notes when p < 5: openBonus

transition(a → b):                         # consecutive nodes
  c = 0
  if a.p ≠ b.p:
    s = shiftBase + shiftPerFret · |a.p − b.p|
    if b.free or a is all open or b is all open: s ·= freeShiftFactor        # break: micro-shift
    if a finger plays the same string in a and b:  s ·= guideFactor          # guide finger
    if b.holds: s += heldShift                                               # the held note pins the hand
    c += s
  c += stringCross · |lowest string of a − lowest string of b|
  if not b.free:
    for fretted x in a, y in b with x.finger = y.finger, x.fret = y.fret, x.string ≠ y.string:
      unless x.finger = 4 and {x.string, y.string} are the two top strings
          or x.finger = 1 and (b.holds or b.alternates):                    # index barre
        c += roll
  return c

solve:
  Viterbi over nodes with candidates and transition; take the cheapest path
  write finger, position (null for open strings) and retabFrom (when the chosen string/fret differs)
  tie continuations copy the note they continue; dead notes keep their tab with finger null
```

### How the rules come out of the costs

- **Sparse, no break (rule 3).** Keeping the position and using the little finger costs rank 3. A one-fret shift costs 4 and a two-fret shift costs 6. So the little finger takes the far note, going up or down. Example: Vortex Surfer bars 162–165, where A on E5 takes the little finger and G on E3 the index, in position 3.
- **Sparse, with a break (rules 2 and 4).** After a rest, a shift costs a quarter (1 for one fret), which is cheaper than a middle, ring or little finger. So the index moves to the note. Example: Killing in the Name bar 38, where A5 is reached with the middle finger sliding up from A3 and then taken over by the index at the first rest.
- **Dense (rule 1).** Finger ranks only break ties, so the position that covers the phrase with the fewest shifts wins. All fingers of the box are used.
- **Low positions (rule 5).** A phrase spanning four frets below position 6 cannot be held in one box. The solver shifts by a fret, preferably on an open string or a rest. Example: the Killing in the Name verse, D2–A5 in drop D.
- **Rolling (rule 6).** A roll costs more than shifting a fret and back, and more than a retab. So a roll is only chosen when nothing else is possible.
  - Simultaneous notes at the same fret are exempt. One finger barring a double stop (drop-D power chords) is the standard technique.
  - So is the index laid across the strings for a note plucked at the fret of a note that still rings (Intension: the root held on the low D string, a harmonic plucked on the A string at the same fret). The two sound together, so it is a barre.
  - So is the index for two notes that go back and forth at one fret without a break (owner, 2026-11-05). Before, the solver moved the hand a fret back and forth so two fingers could take them (Creep's verse, Hey Jane's walk-up, Forty Six & 2's F–C and B♭–F), or moved one note to an open string (Paranoid, wearing yr smell). Only the index: with any finger allowed, the solver chose a little-finger barre to save a shift (Hey Jane bar 24). The rule changed the fingering of 23 songs already in the library and 5 of the new Tool songs, all on such passages; the Vortex Surfer fixture did not change.
- **Notes that ring together (2026-11-05).** The solver does not follow a held note, so before this rule it could move a held root to another string while the note plucked over it stayed, and put two notes on one string (Intension, 28 beats). Now the held note's origin and the notes plucked while it rings keep the source tab, and the hand does not move until it stops (`heldShift`). The source tab is a playable shape, and let-ring shapes are rare: of 55 songs only Intension changed. It also keeps Intension's natural harmonics on their frets; the importer does not read harmonics yet (deferred, below).
- **A pitch doubled on two strings (2026-11-05).** Sober and Forty Six & 2 play D on the A string fret 5 and on the open D string in one chord. The node lists the pitch twice, so each note gets its own string, and the retab cost counts a source tab once per pitch. Before, both notes were written to the same string.

### Other beginner rules

Implemented:

| Rule | How |
|---|---|
| 1-2-4 fingering in low positions | `box(p)` for p ≤ 5 |
| Shift during rests, dead notes and open strings | `freeShiftFactor` |
| Shift by sliding the finger that just played along the same string | `guideFactor` |
| Stay on the source tab unless it clearly helps | `retab` |
| Open strings in low positions | `openBonus` |
| Repeated notes keep their fingering | collapsed nodes |
| Sidecar overrides pin notes; the solver plans around them | `overrides` |

Deferred:

| Rule | Why |
|---|---|
| Slides keep one finger; hammer-ons and pull-offs need two fingers on one string | The importer does not read legato marks yet |
| Natural harmonics stay on their string and fret (they exist nowhere else) | The importer does not read harmonics yet; only Intension and Schism have them, and Intension uses a sidecar override where the solver moved one |
| Wider spans above fret 12, where the frets are narrow | No song needs it yet |
| A long note as partial break time (tempo-aware shifts) | Breaks are structural (rests, open strings) for now |
| Hand-size setting: 1-2-4 vs one finger per fret as a user choice | Needs per-user fingering at runtime (ADR-0004 computes it at build time) |

### Output

- Per note: `finger` (0 open, 1–4 index to little, null dead), `position` (null for open and dead) and `retabFrom` if changed.
- Finger 3 never appears in positions 1–5, because there the ring finger supports the little finger.

## Consequences

- The output is deterministic and testable.
  - `src/core/fingering.test.ts` has one case per rule.
  - The Vortex Surfer fixture (`reference/vortex-surfer-chunks.json`, bars 130–176) was revised for these rules on 2026-09-29, and `scripts/pipeline.test.ts` checks it.
- Revised fixture:
  - Bar 130 keeps the source A1. The retab to E6 is gone, because E3–E6 no longer fits one low box.
  - Riff A moves between positions 3 and 4, one fret at a time.
  - Bar 169 is still re-tabbed from E7 to A2.
- Songs with four-fret phrases in low positions show more small shifts than before. Most of them fall on open strings or rests.
- Changing a constant changes the generated data of every song. Rebuild with `npm run build:songs` and review the diff (ADR-0014).
