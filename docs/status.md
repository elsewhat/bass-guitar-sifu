# Implementation status

Updated 2026-10-12. This is the hand-off point between working sessions: what is done, what is next, and what is waiting on the owner. The build sequence comes from the approved plan; the decisions are in `docs/adr/`.

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

10. **Music source and song intake** (2026-09-29; **ADR-0022, proposed**).
   - **Music source.** `MusicClock` (`src/playback/music-clock.ts`) and the `<audio>` + Web Audio player (`src/playback/music-player.ts`) play `songs/<slug>/audio.mp3`, an MP3 rendered from the transcription.
     - It runs at full speed only. The tempo control is locked at 100 %, and the chosen tempo comes back on the other sources.
     - Chunk loops seek at the wrap; play-through into the next chunk needs no seek.
     - `TempoLookup.tickAt` is the inverse of `secondsAt`.
     - There is a Music mixer channel.
     - The Vite plugin serves `data/audio/<slug>.mp3` with byte ranges and copies the files into the build.
   - **Offsets.** `inspect-song -- <slug> --audio <mp3>` (`scripts/lib/audio-align.ts`, `mpg123-decoder`) measures the lead-in. Every render starts at 0–20 ms and ends with a 2–7 s tail; there is no drift. Zombie's onset match is weak, so its offset is the first-sound estimate.
   - **Songs.** 14 songs were added with `/preprocess-song`:
     - Paranoid, The Wheel, Un Chien d'Espace, wearing yr smell;
     - About A Girl, Come As You Are, Smells Like Teen Spirit, The Man Who Sold The World, Creep;
     - Bombtrack, Bullet in the Head, Bulls on Parade, Black Hole Sun, Zombie.
     Each has chunks, a verified YouTube id and a Music offset. The reasoning, overrides and doubts are in each `song.yaml` `notes`.
     - Overrides: Bombtrack bar 60, Come As You Are bars 27 and 29, Un Chien d'Espace bars 32 and 291.
     - Killing in the Name now uses the re-exported `(1)` file (identical bass part) and has Music.
   - **Tests.** 109 unit tests, including `music-clock.test.ts`, `audio-align.test.ts`, `tickAt` and `media.music` validation. 13 Playwright tests, including Music playback with the tempo lock and position hand-off, and Music disabled without an MP3.
   - Checked in the preview: Creep chunk loop (audio 62.6 → 73.0 s, then back to 62.6 s, pass 2) and a late The Wheel chunk (seek to 1048.5 s in the 18 MB file).

11. **Song library overlay** (system description §4, `design/artboards/SelectorOverlay.dc.html`).
   - `src/components/SongLibrary.tsx` replaces the temporary list in the header: 960 × 640 panel, search (title or artist), `All` and the top three artist chips (clicking the active chip clears it), result count, three-column cards with meta line, tuning badge (orange for other tunings than standard), progress bar and text; the current song has the green ring and `Playing · …`. Ctrl K / Cmd K opens it; the backdrop, the close button and Esc close it. Pure helpers in `src/practice/library.ts` with tests.
   - **Progress (ADR-0010)**: `<slug>.progress` in `src/state/storage.ts` keeps the chunk, the done chunks with their tempo, the tempo and the last practised time. It is saved when these change and restored when the song is loaded; a new song starts at chunk 1 and 100 %. Loading a song alone does not count as started.
   - The modal panels' shadow (library and mixer) now uses the `shadow-heavy` token; the colour-first arbitrary value was read by Tailwind as a shadow colour and drew nothing.
   - Tests: 117 unit tests; Playwright test for search, chips, Esc, Ctrl K, song choice and restored progress.

12. **Keyboard, chords and repeats** (2026-09-30; the owner put the YouTube source on hold).
   - **Keyboard shortcuts** (system description §3.4):
     - `Space` play/pause, `←` / `→` previous / next chunk, `+` / `−` tempo.
     - Pure mapping in `src/practice/keys.ts`, one window listener in `src/components/useTransportKeys.ts`. It is off while the library or the mixer is open and while a form field has focus.
     - New `prevChunk` / `goPrevChunk`. The transport tooltips show the keys.
   - **Chords and double stops** (§3.5, owner's choice: stacked tab rows):
     - `Pluck.notes` holds every note of the beat, highest string first. `Pluck.chord` is the name from `src/core/chord-name.ts` (`D5`, or `null`).
     - The hand position comes from the chord's fretted notes, so the Killing in the Name D5 is at position 5.
     - `sameNote` compares every note.
     - The Now/Next squares show one band per note in its string's colour. The fretboard lights every finger, draws a dot on each string of a barre, and puts a Next ring on every note of the next chord.
   - **Repeat unrolling (ADR-0023, proposed)**:
     - `src/core/unroll-score.ts` rebuilds the alphaTab score in played order, taken from alphaTab's MIDI generator; the tests cover repeats, alternate endings and D.C. al Fine.
     - `loadScore` unrolls it. The song JSON gets `playOrder` only for scores with repeats; the other 16 songs are byte-identical.
     - The strip unrolls the `.gp` with that order before rendering, so the Synth plays the same timeline.
     - `inspect-song` prints the mapping from played to written bars.
   - **Freedom** added with `/preprocess-song`:
     - 110 played bars from 105 written; written bar 98 is played ×6.
     - 23 chunks, YouTube `H_vQt_v8Jmw` (RATMVEVO), Music offset 0 ms with no drift.
   - The e2e test for Music now expects 20 px of scroll: Killing in the Name bars 1–4 are whole-note chords, engraved narrow.
   - Tests: 140 unit tests, 16 Playwright tests (keyboard, the D5 bands, Freedom with the Synth after the repeat).

13. **Lyrics** (2026-09-30; **ADR-0024, proposed**). The owner allows lyrics to be shared; ADR-0011 and ADR-0012 are amended.
   - **Synced lyrics from the score.** `scripts/lib/gp-lyrics.ts` reads the vocal track's syllables in played order (the track with the most syllables, or `lyrics.track`). It reads the track's lyrics text from `Content/score.gpif` with a small zip reader, because alphaTab drops that text.
     - `src/core/lyrics.ts`: `lyricChunks` (alphaTab's syllable rules plus line numbers), `syncedLyrics` (words and lines), `parseLyricsText`, `lineSwitchTicks` and `lyricsCursor`.
     - Lines come from the text's line breaks, `[Section]` comments and blank lines. Where the text has none (Killing in the Name, Bulls on Parade) or a line is over 12 words (About A Girl), lines are cut by `LINE_SPLIT`: rests, sentence ends and capitals.
     - 10 songs have synced lyrics: About A Girl, Black Hole Sun, Bulls on Parade, Come As You Are, Creep, Killing in the Name, Paranoid, Smells Like Teen Spirit, The Man Who Sold The World and Zombie. The other 7 have no vocal track with lyrics; their JSON did not change.
   - **Unsynced lyrics** from `lyrics.text` in `song.yaml` (a `text: |` block scalar; blank lines between stanzas; `[Chorus]` labels; owner's choice to keep them in the sidecar). The owner supplied them for the 7 songs without a vocal track (The Wheel, Vortex Surfer, Un Chien d'Espace, wearing yr smell, Bombtrack, Bullet in the Head, Freedom); Claude does not look up lyrics itself. Every song now has lyrics. `lyrics: { source: score | text | none, track }` overrides the choice.
   - **View** (`src/components/Lyrics.tsx`, `.lyrics-line` in `index.css`), after `design/artboards/LyricsView.dc.html`:
     - With lyrics on, the video cell keeps only the key info in one row (small count cells, or the Synth or Music status) and shows the lyrics below it.
     - Synced: the current line is 30 px with the sung word lit, and the list glides to each new line, at most two beats early. Updates go through the frame loop, not React.
     - Unsynced: plain lines, `↑` / `↓` and the mouse wheel scroll one line.
     - Lyrics toggle next to the mixer button, on by default and kept in settings (`lyricsOn`); disabled for songs without lyrics. The header no longer reserves a lyrics block.
   - `inspect-song` has a `## Lyrics` section (counts only) and the `preprocess-song` skill reports the lyrics source.
   - Tests: 162 unit tests (`lyrics.test.ts`, pipeline lyrics tests on Creep, Killing in the Name and Bombtrack, keys); 17 Playwright tests, including the lyrics view following playback, the toggle kept after reload, and a song without lyrics. Checked in the preview for Creep, Killing in the Name, and temporary placeholder unsynced lyrics on Vortex Surfer (removed).

14. **Count-in** (2026-09-30; **ADR-0025, proposed**). The owner's choices: a count-in only when play starts, one bar long.
   - Play, and a chunk change or restart while playing, start with one bar of metronome counts. Passes, auto-advance and play-through continue without a gap.
   - The counted bar has the meter and tempo (× the tempo setting) of the start bar and ends where playback starts, so a resume on beat 3 counts `3 4 1 2`. Only beats are sounded. `countInPlan` / `countInState` in `src/playback/count-in.ts`.
   - Metronome: `CountClock` schedules the count-in on its own audio clock and starts the timeline right after it. The Web Audio sounds moved to `src/playback/count-sounds.ts` (`CountSounds`).
   - Synth and Music: `CountInPlayer` (`src/playback/count-in-player.ts`) behind a `CountInPort`; the player starts when the count-in's end is due. Pause cancels the count-in.
   - The count-in follows the mixer's Click, Voice and master. `getTick()` holds at the start; `countInState()` drives the count cells, which the Synth and Music views show only during the count-in.
   - Tests: 172 unit tests (`count-in.test.ts`, count-in cases in the Synth and Music clock tests with `count-in.fake.ts`); 18 Playwright tests, including Play and a chunk change counting in. The playback e2e tests wait longer for the scroll, and the playhead test samples from the count-in on.
   - Checked in the preview with Paranoid (163 bpm): Metronome, Synth and Music count one 4/4 bar (about 1.5 s) before playing, and `Next chunk` while playing counts in again.

15. **Album covers** (2026-10-03; **ADR-0026, proposed**). The header's artwork square shows the album cover of every song.
   - `songs/<slug>/cover.jpg` (300 px) from the iTunes Search API, chosen by hand per song with `npm run fetch-cover` (`scripts/fetch-cover.ts`) and recorded as `cover: { album, itunesId }` in `song.yaml`. Served at `data/covers/<slug>.jpg` by the `song-scores` Vite plugin.
   - The song JSON has `cover: { url, album }`; `build:songs` fails when `cover` is set without `cover.jpg`, and warns about songs without a cover.
   - The `preprocess-song` skill has a new step 4c.
   - Tests: sidecar validation; the e2e tests check the Vortex Surfer and Creep covers load.

16. **YouTube source** (2026-10-11; **ADR-0028, proposed**). The owner took it off hold: play the video Songsterr uses, driven by the chunks, the loop and the transport, for every song.
   - **Sync from Songsterr.** Songsterr lists, for each tab revision, its videos and the video time of every bar start. `npm run fetch-video -- <slug> [--write] [--video <id>]` (`scripts/fetch-video.ts`, `scripts/lib/songsterr.ts`, `scripts/lib/video-sync.ts`) finds the tab and the revision of the `.gp`'s date, and writes `media.youtube` into `song.yaml`: `videoId`, `songsterr: { songId, revisionId }` and one `sync` anchor per bar.
     - The recordings drift 0.1–45 s from the score's tempo map, so one offset would not do.
     - 18 videos have a point for every bar. For the other 13 the points are matched to the bars by duration (`alignPoints`): bars at the end without a point, a point at the very end, or two points in one bar. What was done is in each song's `notes` under "YouTube (2026-10-11)".
     - All 31 songs are configured: 4499 anchors. 14 songs changed video to Songsterr's default. Go With The Flow keeps the official video from Songsterr's alternatives, because the default (a Topic upload) is blocked in Norway.
   - **Sync map.** `src/core/sync.ts` (`syncMap`, `syncProblems`): linear over score time between anchors, the score's tempo outside them. The build rejects bad anchors.
   - **Clock.** `YouTubeClock` (`src/playback/youtube-clock.ts`) over a `VideoPlayer` port, modelled on the Music clock. It works in video time, seeks at the chunk end (no seek into an adjacent chunk), runs on for a moment after a start or seek until the player reports, ignores the old position the player reports right after a seek, holds while the video buffers, and follows clicks on the video (`onExternal`). Any tempo from 40 to 100 % (the player takes any rate).
   - **Player.** `src/playback/youtube-player.ts`: the IFrame API (`youtube-nocookie.com`, `controls=0`), loaded when YouTube is first chosen. A never-started video is run muted and paused at the start during the count-in, and started 50 ms before the count-in ends. Keyboard focus is handed back after a click on the video. `src/playback/video-host.ts` gives the engine the host element.
   - **UI.** The video fills the video cell. Status text over it while loading or on an error, count cells over the dimmed video during a count-in, the loop chip in video time, synced lyrics as a subtitle band (`Subtitles` in `Lyrics.tsx`). The mixer's Video channel is applied.
   - **Measured against the real player** (headless Chrome, Creep): the tick is within 2 ms of the video's time while playing (95 %), 5–12 ms right after a loop wrap, the video is heard within about 10 ms of the downbeat after the count-in, and play-through into the next chunk has no seek. All 31 videos load and play from this machine through the app.
   - Tests: 228 unit tests (`sync.test.ts`, `youtube-clock.test.ts` with a fake player, `video-sync.test.ts`, sidecar and build validation, the video-time loop label); 19 Playwright tests, one of them the YouTube source against a stand-in for the IFrame API (count-in, tempo, loop wrap, chunk change, clicks on the video, back to the Metronome).
   - The `preprocess-song` skill has a new step 6b (`fetch-video`) instead of the YouTube search.

17. **Vortex Surfer: sync measured in the recording, and two copies** (2026-10-11; **ADR-0029, proposed**). The owner reported that the tab trailed the video and that the first minutes of the song have no bass tab.
   - **Sources.** No transcription by a person exists. Songsterr's tab is AI-generated, and the file in the inbox was its AI retranscription. Elsewhere there is only a chord sheet written by ear (nortabs.net) and automatic chord sites.
   - **The lag.** Songsterr's points put every bar a quarter note late up to bar 176 and an eighth late from bar 192: 0.55 s and 0.27 s, measured on the bass's pitch changes. The tab's notes from bar 130 and its 243 bars are right.
   - **The fix.** `vortex-surfer` has new anchors: the bar starts measured in the recording (an eighth-note grid tracked from its onsets, the bars placed on the chord changes). On the same check they are within about 30 ms. The method and the checks are in ADR-0029. The measuring scripts were one-off (Python with numpy and scipy) and are not in the repository. The audio was fetched into a temp folder with the owner's permission and deleted.
   - **The first minutes.** The recording has no bass below the guitar before bar 130. The lowest voice is a guitar's low strings (B2, A2, E2, G2); below 80 Hz there is only the kick drum.
   - **Copies** for comparing, with the same video and cover:
     - `vortex-surfer-from-the-start`: the same tab with one whole note added in each of bars 16–129, the guitar's lowest note at the pitch it sounds. 18 chunks. Its `score.gp` is derived with alphaTab, not a Songsterr export.
     - `vortex-surfer-retranscribed`: the inbox retranscription (236 bars, eight tracks). 10 chunks, synced lyrics from its AI vocal track, measured anchors.
   - **Music.** The inbox MP3 is rendered at 110 BPM, from the 243-bar score, so it is now `songs/vortex-surfer/audio.mp3` (offset 3 ms). The copies have no Music source.
   - Three of the 31 Songsterr tabs in the library are AI-generated: Vortex Surfer, The Wheel and wearing yr smell.
   - Tests: 228 unit tests and 19 Playwright tests. The e2e tests pick the Vortex Surfer card without brackets, and the "no MP3" test uses `vortex-surfer-from-the-start`. Checked in the preview: the three songs load, YouTube is ready, and chunk 1 of `vortex-surfer` loops 4:45–4:54 of the video (4:46–4:55 before).

18. **Roadwork Vol. 1: six songs transcribed from the recording** (2026-10-12; **ADR-0030, proposed**). The owner asked for the rest of the album (without Words of Wisdom) and expected that no tabs exist.
   - **Sources.** None: Songsterr, Ultimate Guitar and the chord sites have nothing for these tracks. The library's The Wheel and Un Chien d'Espace are other takes.
   - **Songs.** All in standard tuning, with the album's uploads by Motorpsycho - Topic as the YouTube video, measured anchors and the cover of Roadwork Vol. 1. No Music source and no lyrics.
     - `you-lied`: 99 bars, 25 chunks. 83 BPM in sixteenth notes; the riff D–A–C on the A string.
     - `black-to-comm`: 171 bars, 31 chunks. Seven eighth notes on D and a C.
     - `vortex-surfer-live`: 224 bars, 51 chunks. One more copy of Vortex Surfer (ADR-0029): whole notes of the lowest voice to 4:11, then the roots in eighth notes.
     - `the-other-other-fool`: 326 bars, 40 chunks. One figure on E; nothing sounds below the open D string.
     - `super-wheel`: 464 bars, 57 chunks. Superstooge's two-bar riff, a jam, The Wheel's riff in D.
     - `a-k9-suite`: 752 bars, 70 chunks. Un Chien d'Espace's parts, a long C drone as whole notes, a long build as C in eighth notes.
   - **Method.** Demucs removes drums and vocals. The lowest voice of the rest is read per eighth note (per sixteenth in You Lied) on a pulse grid tracked in the recording. Bars that sound alike vote together. The bar starts are the sync anchors. The analyst's decisions per song (bar lines, odd bars, lowest note, parts written as whole notes) are in `scripts/transcribe/songs/`. ADR-0030 has the details and what was measured on the way.
   - **Tools.** `scripts/transcribe/`: Python with numpy, scipy, PyTorch and Demucs, and `write-score.ts` and `write-sync.ts` with alphaTab. They are not part of the build or CI. Run on the saved features, they give the six scores again byte for byte.
   - **Skill.** The `preprocess-song` skill has a section 10 for a song without a tab: what to ask the owner, the decisions that make or break the reading (the grid, the bar lines, octaves, parts where the lowest voice is the guitar), the checks, and what `song.yaml` and the summary must say. `scripts/transcribe/README.md` has the installs and commands that were run.
   - **Checks.** Vortex Surfer (Live) has the studio tab's root in 92 of 93 loud bars (the other is a rest in the tab), and the roots of `vortex-surfer-from-the-start` in all 114 bars before that. The main riffs come out the same across their repeats. Nobody has listened: the transcriptions are not checked by ear.
   - **Recordings.** Fetched into a temp folder with the owner's permission and deleted. PyTorch and Demucs went into a temporary Python environment.
   - Tests: 228 unit tests and 19 Playwright tests. The library search test types "the wheel" now, because "wheel" also finds Super/Wheel. Checked in the preview: the six songs load and their videos are ready.

## Next

- The six transcribed songs (ADR-0030) are a first reading. What would improve them most:
  - the owner's corrections by ear, written into `scripts/transcribe/songs/<slug>.json` (octaves, bar lines, parts to leave out);
  - telling held notes from struck ones better;
  - a second opinion from Songsterr's AI transcription, where the owner can make one.
- A tap-sync editor (ADR-0016) is not built. It is only needed if Songsterr's points turn out wrong for a song; anchors can also be corrected by hand in `song.yaml`.
- Remember the chosen source per song (the system description lists it under persistence; today every load starts on the Metronome).
- Export and import of all progress as a JSON file (ADR-0010). The design has no settings dialog for it yet.
- The Wheel and wearing yr smell come from AI-generated Songsterr tabs, like Vortex Surfer. Their bars may sit on the wrong beat of the video in the same way. Measuring them needs the recording (ADR-0029: the owner's permission each time); the tools are now in `scripts/transcribe/`.
- `fetch-video --write` does not know which songs have measured anchors and would replace them. The warning is only in those songs' `notes`.

Open points from slice 1 (not blocking):

- alphaTab 1.8 always draws "rendered by alphaTab" below the first bar. It shows only when bar 1 is on screen. There is no setting; it is left in place.
- The in-app preview pane throttles `requestAnimationFrame`, so frame rates must be checked in a normal browser.

## Waiting on the owner

- Review ADR-0030 and listen to the six Roadwork songs with YouTube in a normal browser. Each song's `notes` end with what to check. In short:
  - `You Lied`: the octave of the A, the first sixteenth of the bar, the bars with G.
  - `Black to Comm`: is the C on the last eighth of every bar?
  - `Vortex Surfer (live)`: does the tab ring land on the first B♭ at 4:11 and on the B at 6:25? Are the whole notes of the first four minutes wanted?
  - `The Other Other Fool`: the octave (written on the D string; nothing lower sounds), D or A as the first note of the figure, the 7/8 bars.
  - `Super/Wheel`: where the Superstooge riff starts in the bar, and The Wheel's riff against the snare.
  - `A K9 Suite`: the figure on F and G, the walk down, and how much of the long C parts to keep.
  - Most corrections are a line in the song's file under `scripts/transcribe/songs/`. The features computed from the audio are only in the session's temp folder, so a later session needs the recordings again, with the owner's permission.
  - Paste lyrics into `lyrics.text` where wanted; none were added.
- Review ADR-0029 and try the three Vortex Surfer cards with YouTube in a normal browser:
  - `Vortex Surfer`: does the tab ring land on the bass from bar 130 (4:46) and again from bar 192 (7:04)? Does Music sound right against the strip?
  - `Vortex Surfer (from the start)`: are the added notes what you hear as bass in the first minutes? Should they be an octave lower, where the bass plays the same roots later? Is one note per bar enough?
  - `Vortex Surfer (retranscribed)`: does the lit word land on the singing? Are bars 124–127 wanted? They are not in the recording.
  - Decide which copies to keep. To remove one, delete its folder in `songs/` and run `npm run build:songs`.
- Approve the revised Vortex Surfer fingering in `reference/vortex-surfer-chunks.json` (bars 130–141, 143, 162–165 and 170–173 changed with the beginner rules). Also check the new small shifts in the Killing in the Name verses; they fall on the open D.
- Review ADR-0018 (clock interface and loop decisions) and accept or change it.
- Review ADR-0019 (Synth source). Listen to the Synth in a normal browser: the bass-only sound, the wrap and play-through gaps, a tempo change while playing, and whether the ring and scroll lag the sound (if they do, add an output-latency offset in `src/strip/synth-player.ts`). The mix switch is now the mixer's Quick mix (ADR-0020).
- Review ADR-0020 (mixer) and ADR-0021 (repeat modes) and accept or change them. Listen to the mixer in a normal browser: Synth track volume, mute and solo while playing, and the Metronome click level (default 70 %).
- Try slice 1 in a normal browser: Count playback, loop and auto-advance, tempo, the fade, and 60 fps while scrolling.
- Make `elsewhat/bass-guitar-sifu` public, and set Pages → Source to "GitHub Actions" (ADR-0012). The workflow already exists.
- Record the count samples: `one` … `four`, `and`, as WAV files in `public/audio/count/`. Until then the mixer shows the Voice channel as "No samples".
- Review ADR-0028 (YouTube source) and try it in a normal browser:
  - Does the tab ring land on the bass in the video? Try a steady song (Paranoid, wearing yr smell) and one that drifts (Un Chien d'Espace, Peter Gunn, The Wheel).
  - The bars each song's `notes` list under "To check by ear": the last bars without a point (Creep 91, Fell on Black Days 92–94, The Man Who Sold The World 101–102, The Lost Art 102–103, Killing in the Name 120, About A Girl 93), the merged points (Come As You Are 107, Freedom 89, Zombie 107), and the slow endings.
  - The loop wrap: is the gap of about 50 ms acceptable? Is the video on the beat after the count-in?
  - Songsterr's default videos that are not official uploads: bad guy (a lyric video), Bullet in the Head, Iron Man, Plush, The Lost Art of Keeping a Secret (a vinyl rip), War Pigs (a pitch-corrected upload), Seven Nation Army ("in Standard Tuning with 4 Count"), The Wheel (a live recording, which the tab follows), Vortex Surfer and wearing yr smell. Another video of the tab can be chosen with `npm run fetch-video -- <slug> --video <id> --write`.
  - Go With The Flow: the official video is about two bars shorter than the score, so playback stops just before the end.
  - **Overlays on the player.** The source switch, the chips, the two buttons and the subtitle band lie over the video, as in the design. YouTube's developer policies do not allow elements in front of the player. Decide whether they stay or move outside the video on the public site.
  - Songsterr's bar timings are now in the repository and public on Pages (same status as the `.gp` files).
- Review ADR-0025 (count-in). Listen in a normal browser: does the Synth or Music start late after the last count (start-up latency)? Is one bar at slow tempo settings too long?
- Review ADR-0022 (Music source). Listen in a normal browser:
  - Does the tab ring land on the notes with Music? Check a chunk start after a seek and a loop wrap. The offsets are 0–20 ms, and output latency is removed.
  - Is the wrap seek smooth enough?
  - Zombie's offset (weak onset match).
  - The rendered MP3s add about 82 MB to the repository and are public on Pages (same status as the `.gp` files).
- Review ADR-0023 (repeat unrolling, played bar numbers). Look at Freedom's chunks and `notes`:
  - the Outro riff is 14 bars, split 7 + 7;
  - the official video may have extra footage (the Topic upload is `7pAr6B7fqyM`).
- Review ADR-0024 (lyrics) and try the lyrics view in a normal browser:
  - Does the lit word land on the singing with Music? It uses the same clock as the tab ring.
  - Line breaks in Killing in the Name and Bulls on Parade are cut by timing. They can be fixed by adding line breaks to the lyrics text in the `.gp` file, or with `lyrics.text` and `lyrics.source: text`.
  - Is a two-beat read-ahead right, and is the 300 ms glide pleasant?
  - Skim the pasted `lyrics.text` of the 7 unsynced songs. They are kept as supplied, only the titles and web-page leftovers were dropped (e.g. The Wheel's "and" line lost its leading space).
  - The lyrics toggle is now never disabled, since every song has lyrics; the e2e test covers the unsynced view on Bombtrack instead.
- Review ADR-0026 (album covers). The covers are public on Pages like the other song files. Choices worth a glance: About A Girl uses the Bleach Deluxe Edition artwork (it has a "Deluxe Edition" sticker; iTunes has no plain Bleach), Zombie the 2025 remaster of No Need to Argue, and The Man Who Sold The World the MTV Unplugged album.
- Look at the chord view (stacked tab rows) in a normal browser: Killing in the Name bars 1–4, the Bombtrack power chords, and the Bulls on Parade dead-note chords. The design artboards have no chord view yet, so the owner may want to add one.
- Skim the new songs' `notes` for the by-ear doubts, for example:
  - The Wheel is 18:55 in the score against 16:58 on the record;
  - Creep's YouTube video may be the radio edit;
  - the Come As You Are riff is fingered in two different positions.

## Environment notes

- On the owner's Windows machine, Git Bash may need `export PATH="/c/Program Files/nodejs:$PATH"`. Git Bash also rewrites `BASE_PATH=/bass-guitar-sifu/` into a Windows path, so run Pages-base builds and e2e from PowerShell.
- `.claude/launch.json` starts Vite through `node.exe` directly (the `dev` configuration), because Node is not on the app's PATH.
- Playwright's own browsers are not installed on the owner's machine. The e2e suite was run with the installed Chrome through a temporary config (`projects: [{ use: { channel: 'chrome' } }]`); `npx playwright install chromium` makes `npm run test:e2e` work as it is.
- The in-app preview pane does not run `requestAnimationFrame` while it is hidden and cannot click into the scaled video frame. The YouTube source was checked with headless Chrome instead.
- The owner makes the git commits. Do not commit.
- Python 3.14 with numpy and scipy is at `C:\Users\dagfi\AppData\Local\Python\pythoncore-3.14-64\python.exe`. The `python` alias fails from some folders; use the full path. There is no ffmpeg on the machine (the `imageio-ffmpeg` package carries one).
- `scripts/transcribe/` needs PyTorch and Demucs as well. They are not installed on the machine: they were in a temporary virtual environment (PyTorch 2.14 with CUDA 12.6 for the RTX 2080 Ti, about 4.5 GB). Demucs keeps its model weights in `.cache\huggingface` under the user folder (81 MB).
