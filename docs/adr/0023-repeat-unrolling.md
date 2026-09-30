# ADR-0023: Repeat signs are unrolled into played bars

Status: Proposed (implemented, awaiting owner review)
Date: 2026-09-30
Amends: ADR-0003 and ADR-0013 (bar numbers are played bars), ADR-0004 (the importer unrolls), ADR-0017 (the strip renders the unrolled score).

## Context

- The importer rejected every score with repeat signs, because the bar numbers in the song data would not match what is heard. Freedom (Rage Against the Machine) waited in `music/` because of this. Its only repeat is written bar 98, `|: :| ×6`, so its 105 written bars are played as 110.
- alphaTab engraves repeats once, as written, but its MIDI generator plays them unrolled: repeat counts, alternate endings, and D.S./D.C./coda/fine (`MidiPlaybackController`). The Synth and the MP3 rendered from the transcription (ADR-0022) therefore follow the played order.
- The old check did not look at jumps (`MasterBar.directions`), so a score with D.C. al Fine but no repeat signs would have been imported in written order without a warning.
- alphaTab 1.8 has no setting to engrave a score with its repeats written out.

## Decision

**Played bars everywhere (owner, 2026-09-30).** Bars are numbered in the order they are played, for Freedom 1–110. This covers the song JSON, the chunks, `fingeringOverrides` and `sync` in `song.yaml`, the practice plan and the strip. After the first repeat, the numbers no longer match the Guitar Pro file's bar numbers.

**Unroll the alphaTab score itself**, right after loading it, with one shared function (`src/core/unroll-score.ts`, which takes the alphaTab module as an argument so `src/core` does not load it):

- `playedOrder` runs alphaTab's `MidiFileGenerator` and reads `tickLookup.masterBars`: the written masterBar of each played bar. This follows alphaTab's own playback rules for every kind of repeat and jump.
- `unrollScore` writes the score to alphaTab's JSON form (`JsonConverter.scoreToJsObject`), rebuilds `masterbars` and every staff's `bars` in played order, and reads it back (`jsObjectToScore`, which recomputes the bar start ticks).
  - It removes repeat starts, repeat counts, alternate endings and jumps, so the result plays straight through.
  - A section marker stays on the first copy only.
  - The copies get new bar, voice, beat and note ids.

**Importer.** `scripts/lib/gp-import.ts` `loadScore` returns the unrolled score, so the import, the audio alignment (`audio-align.ts`) and `inspect-song` all work in played bars.
- `importBassTrack` refuses a score that still has repeat signs or jumps.
- When the order is not the written one, the song JSON gets `playOrder`: the written bar index (0-based) of each played bar. The other songs' JSON is unchanged.
- `inspect-song` prints the mapping, for example `played 98–103 = written 98 ×6`.

**Runtime.** `src/strip/alphatab-score.ts` unrolls the fetched `.gp` with `song.playOrder` before applying the re-tabs.
- The strip then engraves the repeated bars one after the other, with no repeat signs, and never scrolls back.
- The Synth, which plays through the strip's alphaTab instance (ADR-0019), plays the unrolled score. Its MIDI ticks equal the song data's ticks.

**Fingering.** Each copy of a repeated bar is fingered on its own. The solver is deterministic, so identical copies in the same context get the same fingering. An override applies to one played bar.

## Consequences

- Scores with repeats, endings and jumps can be imported. Freedom is in the catalogue: its MP3 aligns with 0 ms drift between the first and the last minute, which it could not do in written order.
- Bar numbers in the app differ from those in Guitar Pro after the first repeat. `song.yaml` `notes` should give the mapping when it matters. `inspect-song` prints it.
- The strip is longer than the written score: repeated bars are drawn once per pass.
- The `.gp` is unrolled twice: once in the build and once in the browser. The browser only runs `unrollScore` with the stored order, not the MIDI generator.

## Alternatives considered

- **Written bar plus pass** (`98 (3/6)`). This is faithful to the file, but chunks, overrides, sync anchors, the strip labels and every bar lookup would need a pass index.
- **Keep the written engraving and map played ticks onto it** through alphaTab's tick cache. The strip would jump back to the repeat start on every pass, and the loop bracket could not mark a chunk that crosses a repeat.
- **Export an unrolled `.gp` at build time** (`Gp7Exporter`) and serve it instead of the source file. The runtime would need no unrolling, but the published score would be a generated copy, and the round trip through the exporter is a second place where content could change.
