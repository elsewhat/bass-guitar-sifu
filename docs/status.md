# Implementation status

Updated 2026-09-29. This is the hand-off point between working sessions: what is done, what is next, and what is waiting on the owner. The build sequence comes from the approved plan; the decisions are in `docs/adr/`.

## Done

1. **ADRs and repo restructure.**
   - ADR-0012 to ADR-0017 are written and ADR-0017 is accepted.
   - The design export has moved to its permanent layout (see `CLAUDE.md`).
2. **Scaffold.**
   - Vite 8, React 19, TypeScript 7 strict, Tailwind 4, Zustand, Vitest 5 and Playwright.
   - The empty 1440×900 practice grid is scaled to fit the window (`src/components/PracticeView.tsx`, `src/components/Stage.tsx`, `src/layout.ts`), with a collapsible practice plan (260 / 56 px rail) and a full-screen button.
   - Tokens: `src/styles/tokens.css` is the Tailwind `@theme` block, with aliases in `src/styles/index.css`. Avoid aliases named like Tailwind sizes (`base`, `sm`, …).
   - CI and deploy: `.github/workflows/ci-deploy.yml`.
3. **Song pipeline.**
   - Code: `scripts/lib/gp-import.ts` (alphaTab importer, beat-level events with a `notes[]` array for double stops, dead notes, tuplets), `src/core/chunks.ts` (tacet, pitch-based bar signatures, greedy draft phrases), `src/core/fingering.ts` (Viterbi solver; its costs are calibrated so the whole Vortex Surfer fixture is reproduced), `scripts/lib/build.ts`, `scripts/build-songs.ts` (`--check`, `--only`), `scripts/inspect-song.ts`.
   - Tests in `scripts/pipeline.test.ts`: the §11 catalogue values for six files, the fixture tacet, fingering and draft chunks, sidecar validation, and deterministic JSON.
4. **`preprocess-song` skill** (`.claude/skills/preprocess-song/`). It has been run by hand on:
   - `songs/vortex-surfer` (fixture chunks; YouTube `ENCBJU-xHcA`, "Motorpsycho - Topic"),
   - `songs/killing-in-the-name` (30 chunks from the section markers; YouTube `bWXazVhlyxQ`, RATMVEVO).

   Neither song has sync anchors yet.
5. **alphaTab spike: accepted.** The results and the implementation guide are in ADR-0017. The spike page (`spike.html`, `src/spike/`) was removed once the strip replaced it; it is in git history. The `song-scores` Vite plugin serves `songs/<slug>/score.gp` at `data/scores/<slug>.gp`. The owner's choices:
   - **"smoothed over 2 beats"** scroll mapping,
   - **no highlight in the notation**, only the tab ring,
   - 60 fps observed.
6. **Slice 1 practice view** (Vortex Surfer + Killing in the Name, Count source).
   - Strip: `src/strip/strip.ts` (`Strip` class, lazily loaded with alphaTab in its own chunk), `src/strip/scroll.ts`, `src/components/TabStrip.tsx`. alphaTab's player is `Disabled` until the Synth source, so no soundfont is loaded. The current-note ring is in the back layer so alphaTab's fret number is not redrawn (owner feedback: the redrawn number shifted). The loop label slides to stay readable. The playhead band was moved to 150 px (four notes to its left), and the scroll is bounded so every note is inside the band when it is plucked (owner, 2026-09-29; ADR-0017).
   - Clock and loop: `PlaybackClock` (`src/playback/clock.ts`), `CountClock` (Web Audio look-ahead, WAVs when present, else tones), `CountTimeline` (pure scheduler math), loop rules in `src/playback/loop.ts`, one rAF loop in `src/playback/frame.ts`. The design choices are in **ADR-0018 (proposed)**.
   - Practice engine `src/practice/engine.ts` wires clock, loop and the Zustand store. Per-frame views (strip, Now fade, fretboard, count cells) write to the DOM directly.
   - Panels: header with meta line, practice plan (rest separators, done ticks, rail), video cell with count cells and chips, transport (passes, repeat button, tempo 40–100 %), fretboard with hand, Now/Next squares.
   - Song choice: temporary "Songs" list (also Ctrl K) and `?song=<slug>`. The YouTube button is shown but disabled.
   - Tests: unit tests for plucks, count labels, `CountTimeline`, loop rules, scroll mapping and view text; Playwright smoke tests for layout, song load, playback scrolling, tempo, chunk selection and song switching.
7. **Synth source** (step 6, first part; **ADR-0019, proposed**).
   - `SynthClock` (`src/playback/synth-clock.ts`) over a `SynthPlayer` port; the alphaTab side is `src/strip/synth-player.ts`, played through the strip's own alphaTab instance (`src/strip/strip-host.ts`). The player and the soundfont load only when Synth is first chosen (`Strip.enableSynth`).
   - Track mix: first `bass` / `band` / `backing` in `synth-mix.ts`; replaced by the mixer (item 9).
   - Video cell: "Synth playback", "Loading sounds… NN %" while loading; Play is disabled until ready. Switching between Count and Synth keeps the position.
   - Checked in the preview: loading, passes, auto-advance into the next chunk, pause and resume, tempo, chunk selection, source switch and song switch. Tests: `synth-clock.test.ts` and a Playwright smoke test.
   - alphaTab 1.8.4 bug worked around: subscribing to `api.midiLoaded` after the player exists overflows the stack, so the strip subscribes before switching the player on.

8. **Fingering for beginners** (ADR-0007 revised 2026-09-29, owner's rules). The solver now has:
   - a 1-2-4 box in positions 1–5 and one finger per fret above that;
   - index-led sparse passages (fewer than 3 different fretted notes in the current and next bar) and whole-box dense ones;
   - the little finger for the far note when there is no break, and micro-shifts in rests and on open strings;
   - guide-finger shifts, and no finger rolling except the little finger between D and G.

   Pseudo code and constants are in the ADR. `src/core/fingering.test.ts` has one test per rule. The retab cost went from 6 to 8, so the solver does not jump to open strings just to shift for free. The Vortex Surfer fixture fingering was regenerated (18 of 47 bars changed), and the e2e smoke test now expects bar 130 on A1.

9. **Design update 2026-09-29** (`design/artboards/Main.dc.html`, `MixerOverlay.dc.html`), in three reviewed steps:
   - **Header and video cell.** The full-screen button is at the right end of the header. The Synth view has no play button (Play is in the transport bar). The source "Count" is shown as **Metronome** (owner; the code id stays `count`).
   - **Tempo** 40–100 %, starting at 100 % (owner).
   - **Playhead**: a single 2 px green line at 150 px instead of the white band (owner; ADR-0017 and §3.6 updated).
   - **Repeat modes (ADR-0021, proposed)**: `repeatMode` `advance` / `once` / `loop` replaces `autoAdvance` in `src/playback/loop.ts`. The transport button cycles advance → play through → loop. **Play through is the default** (owner). Tests per mode, including the last chunk, in `playback.test.ts`.
   - **Mixer (ADR-0020, proposed)**: the equalizer button in the video cell opens `src/components/Mixer.tsx` (master, tabs `YouTube · Synth · Metronome`, channel rows, Quick mix). Pure model in `src/playback/mixer.ts` with tests. `CountClock` has click and voice channels behind a master gain. The Synth applies master, track volume, mute and solo through alphaTab. The song JSON has a new `tracks` list (regenerated `public/data`).
   - **Storage**: `src/state/storage.ts` (ADR-0010, try/catch everywhere) keeps `repeatMode` and `mixer` in `bass-trainer:v1:settings` and `synthTracks` in `bass-trainer:v1:<slug>`. Tests in `storage.test.ts`.
   - Tests: 90 unit tests; 11 Playwright tests including the repeat cycle and the mixer (values, presets, Esc, backdrop, kept after reload).

## Next: step 6

- YouTube source (alphaTab external media + IFrame API) and the tap-sync editor behind `?sync=1` (ADR-0016). Apply the mixer's Video channel there: `setVolume(round(master × video × 100))`, `mute()` when either is muted (ADR-0020).
- Song library overlay (Ctrl K, replaces the temporary list in `src/components/Header.tsx`) and localStorage progress with export and import (ADR-0010). Done chunks and tempo are in the store already but not persisted; `src/state/storage.ts` is the place for it.
- Run `/preprocess-song` on the 8 remaining files in `music/`. Six of them are the design songs.

Open points from slice 1 (not blocking):

- Chords and double stops: the Now/Next squares and the fretboard show only the lowest note (Killing in the Name bars 1–4 show "0" for a D5 chord). The design has no chord view yet.
- alphaTab 1.8 always draws "rendered by alphaTab" below the first bar. It shows only when bar 1 is on screen. There is no setting; it is left in place.
- The in-app preview pane throttles `requestAnimationFrame`, so frame rates must be checked in a normal browser.

## Waiting on the owner

- Approve the revised Vortex Surfer fingering in `reference/vortex-surfer-chunks.json` (bars 130–141, 143, 162–165 and 170–173 changed with the beginner rules). Also check the new small shifts in the Killing in the Name verses; they fall on the open D.
- Review ADR-0018 (clock interface and loop decisions) and accept or change it.
- Review ADR-0019 (Synth source). Listen to the Synth in a normal browser: the bass-only sound, the wrap and play-through gaps, a tempo change while playing, and whether the ring and scroll lag the sound (if they do, add an output-latency offset in `src/strip/synth-player.ts`). The mix switch is now the mixer's Quick mix (ADR-0020).
- Review ADR-0020 (mixer) and ADR-0021 (repeat modes) and accept or change them. Listen to the mixer in a normal browser: Synth track volume, mute and solo while playing, and the Metronome click level (default 70 %).
- Try slice 1 in a normal browser: Count playback, loop and auto-advance, tempo, the fade, and 60 fps while scrolling.
- Make `elsewhat/bass-guitar-sifu` public, and set Pages → Source to "GitHub Actions" (ADR-0012). The workflow already exists.
- Record the count samples: `one` … `four`, `and`, as WAV files in `public/audio/count/`. Until then the mixer shows the Voice channel as "No samples".
- Tap the sync anchors for both YouTube videos once the editor exists.

## Environment notes

- On the owner's Windows machine, Git Bash may need `export PATH="/c/Program Files/nodejs:$PATH"`. Git Bash also rewrites `BASE_PATH=/bass-guitar-sifu/` into a Windows path, so run Pages-base builds and e2e from PowerShell.
- `.claude/launch.json` starts Vite through `node.exe` directly (the `dev` configuration), because Node is not on the app's PATH.
- The owner makes the git commits. Do not commit.
