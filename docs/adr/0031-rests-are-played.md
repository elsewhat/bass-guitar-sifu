# ADR-0031: The bars where the bass rests are played, and the library starts a song at bar 1

Status: Proposed (implemented, awaiting owner review)
Date: 2026-10-12
Amends: ADR-0006 (tacet ranges are no longer skipped in playback), ADR-0021 (what follows a chunk), ADR-0018 (the loop's ranges), ADR-0010 (the stored place, and when it is used).

## Context

Chunks cover the bars where the bass plays. The bars outside every chunk, the tacet ranges, were skipped (ADR-0006): the song opened on the first chunk, and play through jumped from the end of a chunk to the start of the next one. A song chosen in the library continued at its stored chunk (ADR-0010).

The owner, after trying the Vortex Surfer copies (ADR-0029, ADR-0030) with the video:

- Do not skip the parts in the middle of a song where there is no bass. Keep playing, with empty tabs.
- Do not skip the start of a song where there is no bass line. It must be played.
- A song chosen in the song library always starts from the beginning.

With the recording as the source, a skip is a jump in the music: Vortex Surfer lost its first 4:45, and 33 seconds in the middle.

## Decision

### Rests

- A **rest** is a run of bars outside every chunk. There is at most one before each chunk and one after the last chunk. They follow from the chunks in `song.yaml`, so every bar of a song is in a chunk or in a rest, and no song data changes. For the songs in the library they are the same bars as the tacet ranges.
- The loop state has a place: `chunkIndex` and `rest`, which is `null` inside the chunk, `'before'` in the rest that leads into the chunk, and `'after'` in the rest that ends the song (last chunk only).
- A rest is played once, in every repeat mode, and is never looped or marked done. It runs on into its chunk without a seek or a count-in. The rest after the last chunk stops playback at the end of the song.
- When a chunk has had its passes (`advance`) or its one pass (`once`), playback continues in the rest after it, if there is one, and then in the next chunk. The chunk is marked done when it is left. `loop` stays in the chunk, as before.
- On the last chunk, play through goes on through the rest after it and stops at the end of the song. `advance` and `loop` keep looping the last chunk, as before.
- This holds for every song and every source. The clocks did not change: a rest is one more range from `onRangeEnd`.

### Where a song starts

- A song starts at bar 1: in the rest before the first chunk when the bass enters later, else in the first chunk.
- A song chosen in the song library always starts at bar 1, also when it is the song that is playing. Its done chunks and its tempo are kept.
- Opening the page (a reload, or a `?song=` link) continues at the stored place (ADR-0010), which is now a chunk or a rest (`progress.rest`). A song restarted from the library is stored at bar 1, so a reload stays there. A song with nothing stored starts at bar 1.

### What the player sees

- The rest rows of the practice plan (`Bars 1–129 · bass rests`) are buttons. A click starts playback there, with a count-in when playing. The rest being played is white with a green dot.
- `Next chunk` from a rest goes to the chunk it leads into; `previous chunk` goes to the chunk before the rest. Both still jump straight to a chunk.
- While a rest is played:
  - the strip's bracket spans the rest, with the label `Bass rests · bars 1–129`, and the tab lines are empty;
  - the video cell has the chip `Bass rests · bars 1–129` bottom-left, and `Rest 0:00–4:41 · score time` (or video time) bottom-right;
  - the pass counter reads `Bass rests`;
  - the Now square is empty and the Next square shows the first note of the next chunk (`next chunk`).
- The chip `Intro skipped · bass rests bars 1–129` is gone.

## Consequences

- With play through, a song is heard from bar 1 to its last bar without a jump. With the Metronome this means counting through the rests; a click on a chunk goes past them.
- Vortex Surfer opens on 129 bars of rest. The three copies with rests in the middle (`vortex-surfer`, `vortex-surfer-from-the-start`, `vortex-surfer-retranscribed`) and `vortex-surfer-live` (bars 165–179) all play through them.
- `advance` mode also plays the rest between two chunks once, on the way to the next chunk.
- After play through has ended the song in the rest after the last chunk, that rest stays selected; Play starts it again.
- The design artboards show the `Intro skipped` chip and plain separator rows. The owner may want to update them.
- `song.tacet` stays in the song JSON. The build still uses it to check the chunks; the app no longer reads it.

## Alternatives

- **Chunks over the rests in `song.yaml`.** The build rejects a chunk that lies in a tacet range (ADR-0006), a rest would be looped and marked done like a part to practise, and every song would need new chunks.
- **A flag per song.** The owner named the Vortex Surfer copies, but a skip is the same jump in any song, and one rule is simpler to explain.
- **Always start at bar 1, also on a reload.** The owner asked for the library. A reload in the middle of practising keeps its place.

## Implementation notes (2026-10-12)

- `src/playback/loop.ts`: `LoopState.rest`, `restBars`, `restPlaces`, `songStart`, `placeBars`, `loopRange`, `validPlace`, `advanceChunk`, `selectPlace` and `onLastChunk`; `rangeAfterPass`, `completePass`, `nextChunk` and `prevChunk` know about rests. `endsSong` takes the chunks and the bar count.
- `src/practice/engine.ts`: `loadSong(slug, fromStart)`, `pickSong` starts at bar 1, `selectRestAt`; the current range and the saved progress include the rest.
- `src/practice/view-model.ts`: `planRows` builds the rest rows from the chunks, `restChip` replaces `introChip`, and `loopTimeLabel` takes a place.
- Tests: the loop controller tests in `src/playback/playback.test.ts` use three chunks with rests round them; `view-model.test.ts`, `storage.test.ts`; Playwright tests for the start in the rest, play through across a rest, the rest rows, and the library starting at bar 1.
