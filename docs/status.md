# Implementation status

Updated 2026-09-28. This is the hand-off point between working sessions: what is done, what is next, and what is waiting on the owner. The build sequence comes from the approved plan; the decisions are in `docs/adr/`.

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
5. **alphaTab spike: accepted.** The results and the full implementation guide are in ADR-0017. The reference code is `spike.html` + `src/spike/spike.ts`, with helpers in `src/strip/alphatab-score.ts`. The `song-scores` Vite plugin serves `songs/<slug>/score.gp` at `data/scores/<slug>.gp`. The owner's choices:
   - **"smoothed over 2 beats"** scroll mapping,
   - **no highlight in the notation**, only the tab ring,
   - 60 fps observed.

## Next: step 5, the slice 1 practice view (Vortex Surfer + Killing in the Name)

1. Turn the spike into the real strip component inside `PracticeView`'s strip panel. Follow the ADR-0017 implementation guide: settings, layering, bounds quirks, clock, scroll mapping.
2. Build a `PlaybackClock` interface and loop controller (passes, auto-advance, "next chunk", restart) as plain TS with unit tests. Playback position stays out of React state (ADR-0002/0008).
3. Build the `CountClock`: Web Audio look-ahead scheduler (about 100 ms ahead, 25 ms interval) with synthesised tones until the WAVs exist (`public/audio/count/README.md`). It can drive alphaTab's cursor through `EnabledExternalMedia`.
4. Build the fretboard with the hand, the Now/Next squares (fade over 0.9 × the note's duration down to 28 %), the practice plan list, the transport bar (tempo 40–120 % in steps of 5) and the header. Match `design/artboards/*.dc.html`.
5. Load a song from `public/data/songs/<slug>.json`. There is no library overlay yet, so use a temporary song switch or the `?song=` parameter.
6. Extend the Playwright smoke test and remove `spike.html` / `src/spike/` once the strip is in place. Also remove `spike` from `vite.config.ts` `build.rollupOptions.input`.

## Later (step 6)

- Run `/preprocess-song` on the 8 remaining files in `music/`. Six of them are the design songs.
- Song library overlay (Ctrl K) and localStorage progress with export and import (ADR-0010).
- YouTube source (alphaTab external media + IFrame API) and the tap-sync editor behind `?sync=1` (ADR-0016). Then the Synth source (alphaTab player).

## Waiting on the owner

- Make `elsewhat/bass-guitar-sifu` public, and set Pages → Source to "GitHub Actions" (ADR-0012). The workflow already exists.
- Record the count samples: `one` … `four`, `and`, as WAV files in `public/audio/count/`.
- Tap the sync anchors for both YouTube videos once the editor exists.

## Environment notes

- On the owner's Windows machine, Git Bash may need `export PATH="/c/Program Files/nodejs:$PATH"`. Git Bash also rewrites `BASE_PATH=/bass-guitar-sifu/` into a Windows path, so run Pages-base builds and e2e from PowerShell.
- `.claude/launch.json` starts Vite through `node.exe` directly (the `dev` configuration), because Node is not on the app's PATH.
- The owner makes the git commits. Do not commit.
