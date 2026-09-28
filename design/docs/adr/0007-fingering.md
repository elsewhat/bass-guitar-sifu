# ADR-0007: Fingering recommendation

Status: Accepted
Date: 2026-09-28

## Context

Every note shows a recommended fretting finger. The recommendation should keep the hand in one position for as long as possible, which requires looking ahead across the chunk and into the next chunk. Tabs from third parties sometimes place the same pitch on different strings in consecutive bars for no reason relevant to a learner (Vortex Surfer bar 130 uses A-string fret 1 for B♭, bars 134 and 138 use E-string fret 6).

## Decision

- Dynamic programming (Viterbi) over the note sequence of the whole playable range.
- Candidates per note: every (string, fret) with the same pitch, times fingers 1–4 (0 for open strings).
- One finger per fret inside a 4-fret position is the default model. Position p = fret − finger + 1.
- Transition costs: shift distance, string crossings, re-tab away from the file's string/fret (small), stretch beyond 4 frets (high). Open strings get a small bonus below fret 5 and keep the current position.
- Tied continuations and repeated identical notes inherit the previous choice.
- Sidecar overrides pin notes; the solver plans around them.
- Output per note: `finger`, `position`, `retabFrom` if changed.
- Configurable later: 1-2-4 (Simandl) fingering for low positions as an alternative model.

## Consequences

- Deterministic, testable output. The Vortex Surfer fixture (bars 130–176) must be reproduced, including the two re-tabs (bar 130 A1 → E6, bar 169 E7 → A2) and position 2 in chunk 4 chosen to prepare chunk 5.
- Cost weights are tunable constants in one module.
