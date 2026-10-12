---
name: preprocess-song
description: Add a Guitar Pro file (and its rendered MP3) from the music/ inbox to the Bass Trainer catalogue. Inspects the file, moves it to songs/<slug>/score.gp (+ audio.mp3), writes song.yaml (metadata, named practice chunks, the YouTube video and its sync, Music offset, album cover, fingering overrides) and regenerates public/data. Use when the user wants to add, import or preprocess a song, or runs /preprocess-song [file].
---

# preprocess-song

Turns `music/<Artist-Title-MM-DD-YYYY>.gp` (and the MP3 rendered from it, if present) into `songs/<slug>/score.gp` + `audio.mp3` + `song.yaml` and regenerates `public/data/` (ADR-0013, ADR-0014, ADR-0015, ADR-0022). Deterministic work is done by scripts; your job is the judgment: naming, chunking, checking the recording, and reviewing the fingering.

**Input:** a path or file name in `music/`. If none is given, list `music/*.gp`; with one file, process it; with several, ask which (or "all", processed one at a time).

Do not commit. The owner reviews the diff and commits.

## 1. Inspect

```bash
npm run inspect-song -- "music/<file>.gp"
```

Read the whole report: tracks, tuning, tempo map, time signatures, sections, tacet ranges, bar patterns, draft chunks, and the fingering solver's re-tabs and large shifts.

If the automatic bass track is wrong (the report marks candidates), rerun with `--track <index>`. Only 4-string bass tracks are supported; stop and report if there is none.

Scores with repeat signs, alternate endings or D.S./D.C./coda are unrolled into the order they are played (ADR-0023). The report then says `Repeats unrolled` and maps played bars to written bars. **Every bar number in the report and in `song.yaml` (chunks, overrides, sync) is a played bar**; the written bar numbers in Guitar Pro no longer apply after the first repeat. A repeated bar or range shows up as identical letters in the bar-pattern grid, so chunk it like any other immediate repeat (`Riff ×5`).

## 2. Decide metadata

- **Title and artist**: from the report's `.gp` metadata, cleaned up (trim, fix obvious casing typos, keep the artist's own styling such as "wearing yr smell"). Fall back to the file name `Artist-Title-MM-DD-YYYY.gp`.
- **Slug**: lower-case ASCII from the title, words joined by hyphens, apostrophes and accents dropped (`Un Chien d'Espace` → `un-chien-d-espace`). If `songs/<slug>` exists, stop and ask.
- **Source**: `file` = the inbox file name exactly; `date` = the date from the file name as `YYYY-MM-DD` (file names use `MM-DD-YYYY`).
- **bassTrack**: always write the chosen track's exact name, even when automatic.
- **Tempo note**: if the report warns about half/double time, or the rhythm is dominated by very short or very long notes for the style, write a one-line `tempo.note` (e.g. `Notated in half time (53 BPM); the recording is about 106 BPM.`). Check against the recording's actual tempo when you have it in step 6b.

## 3. Move the file

```bash
mkdir -p songs/<slug>
git mv "music/<file>.gp" songs/<slug>/score.gp
```

Use plain `mv` if the file is not tracked yet. The score must never be edited.

If the inbox has an MP3 for the same `Artist-Title` (any date; it is rendered from the same source as the `.gp`), move it too. It is the Music source (ADR-0022):

```bash
git mv "music/<Artist-Title-MM-DD-YYYY>.mp3" songs/<slug>/audio.mp3
```

Then measure its lead-in:

```bash
npm run inspect-song -- <slug> --audio songs/<slug>/audio.mp3
```

Write `media.music: { source: "<the MP3's inbox file name>", offsetMs: <Suggested value> }`. If the report warns about drift or low confidence, still write the offset but say so in `notes`: the MP3 may come from another version of the transcription. An MP3 whose score differs (other bar count) must not be attached; leave it in the inbox and report it.

## 4. The recording

The YouTube video and its sync come from Songsterr, where the `.gp` files come from (ADR-0028, owner 2026-10-11). This is done in step 6b, once `song.yaml` exists. Do not search YouTube for another upload.

With an MP3, use its tempo to confirm the `tempo.note` (it follows the tempo map exactly; the recording may not).

## 4b. Lyrics

Lyrics come from the score (ADR-0024); do not look them up or type them. The report's `## Lyrics` section tells you what the build will use:

- `Synced from [i] "<track>"`: the vocal track with the most sung syllables. If that is a backing-vocals track while the lead also has lyrics, write `lyrics: { track: <lead track name> }`. The build warns when lines are cut by timing because the file's lyrics text has no line breaks; that is fine, mention it in the summary.
- `No vocal track with lyrics`: the song has no lyrics until the owner pastes them into `song.yaml` as `lyrics.text` (a `text: |` block scalar: one line per lyric line, blank lines between stanzas, `[Chorus]` lines as labels). Do not fetch or write lyrics yourself; they are copyrighted text. Say so in the summary.

## 4c. Album cover

The header shows the album cover (ADR-0026). List the albums on iTunes that contain the song:

```bash
npm run fetch-cover -- <slug>
```

Pick the original release of the recording the tab follows: the studio album for a studio version, the live album for a live version (check `notes` and the YouTube video). Avoid singles, EPs, compilations, live albums for studio versions and tribute albums. A reissue (Deluxe, Remastered, Anniversary) is fine when the original is not listed. If nothing fits, retry with `--term "<artist> <album>"`. Then download it:

```bash
npm run fetch-cover -- <slug> --id <collectionId>
```

Look at `songs/<slug>/cover.jpg`, then write the printed `cover:` line into `song.yaml`, with the original album title (drop "(Deluxe Edition)", "(2025 Remastered)" and the like). If no album fits, leave `cover` out and say so in the summary; the header keeps the placeholder.

## 5. Chunks

Chunks are what the player loops. The build requires them; the draft in the report is only a starting point.

Rules:

- Cover every playable bar exactly once, in order, without overlaps. Never include tacet ranges (the report lists them); a chunk may contain an isolated rest bar inside a phrase.
- 2–8 bars per chunk, target 4. Up to 16 bars when merging immediate repeats of the same phrase.
- Start chunks where phrases start: section markers, pattern changes in the bar-pattern grid, returns of a riff.
- The first occurrence of a phrase is its own chunk; its immediate repeats merge into one chunk named `<name> ×N` (N repeats), or `<name> repeat` for a single repeat. Example from Vortex Surfer: `Riff A` 130–133, `Riff A ×2` 134–141.
- Names are short and musical. With section markers, use the section name, adding `a`, `b`, … when a section has several chunks (`Verse 1 a`). Without markers, describe what the bass does (`Riff A`, `Climb`, `E pedal`, `Descent`, `Half-step`, `Outro`), reusing a name for the same material later in the song.
- Prefer boundaries where the hand position (report: `pos`) stays constant inside a chunk.

For **Vortex Surfer**, use the chunks from `reference/vortex-surfer-chunks.json` exactly; they are the acceptance fixture.

## 6. Write song.yaml

Start from [template.yaml](template.yaml). Keep the `yaml-language-server` header line. Use flow style for chunk entries (`- { name: Riff A, bars: [130, 133] }`), quote names containing `:` or `#`. Put reasoning worth keeping (half-time, why a chunk boundary is where it is, doubts) in `notes`, not in comments that the owner might miss.

## 6b. YouTube video and sync

```bash
npm run fetch-video -- <slug>
```

The script finds the Songsterr tab (same artist, most track names in common with the `.gp`), takes the revision that was current on `source.date`, and reports the tab's default video and its sync: Songsterr's video time for every bar start, as one anchor per bar. Check the report:

- **The tab.** It prints how many track names match the `.gp`. With none, check that it is the right tab; give `--song <songId>` (the number after `-s` in the tab's Songsterr address) if it is not.
- **The video.** The title and channel should be the recording the tab follows. It is Songsterr's choice and may be a third-party upload; keep it unless it cannot be played.
- **The sync.** `N anchors for B bars` should cover nearly every bar. The lines below it say which bars got no point, which points were merged, and which bars are far from the score's length. A recording a few seconds off the tempo map is normal. If the counts differ by more than a few bars, the revision is probably not the `.gp`'s: try `--revision <id>`.

Then write it:

```bash
npm run fetch-video -- <slug> --write
```

This replaces `media.youtube` in `song.yaml` (`videoId`, `songsterr`, `sync`). Never write anchors by hand from guesses.

Do not run it with `--write` for a song whose `notes` say the anchors were measured in the recording (ADR-0029: the Vortex Surfer songs). Songsterr's points for AI-generated tabs can sit on the wrong beat of the bar, a quarter or an eighth note late. If the tab's page on Songsterr says it is AI-generated, say so in `notes` and in the summary, so the owner checks the tab ring against the bass by ear.

The owner is in Norway, and "- Topic" uploads are sometimes blocked there. After the build (step 7), check that the video plays: choose YouTube for the song in the app and press Play. If the video cell says it may not be played, pick another video from the report's "Other videos" list, preferring the artist's official channel, and run `npm run fetch-video -- <slug> --video <id> --write`.

Copy the report's findings into `notes`: the video (title, channel, default or why not), the anchor count, and the lines to check by ear. If Songsterr has no synced video, leave `videoId: null` and say so in the summary.

## 7. Build

```bash
npm run build:songs -- --only <slug>
```

Fix every error. Treat warnings (overrides pointing at no note, chunks containing tacet bars, a video without sync anchors) as things to fix or explain in `notes`.

## 8. Review the fingering

```bash
npm run inspect-song -- <slug>
```

Look at the re-tabs, the shifts of 3+ frets, and `pos`/`shifts` per chunk in "Chunks in song.yaml". Add `fingeringOverrides` only for a clear reason a bass teacher would give, for example:

- the solver leaves position for one note that can be reached by a stretch or an open string,
- a fast passage alternates between positions where one position covers everything,
- a re-tab moves a note to a string that makes a repeated figure awkward.

An override is `{ bar, tick, string, fret, finger }` with `tick` from the report's re-tab and shift lines (offset from bar start at 960 per quarter) and `string` 0 = lowest. Rebuild and re-inspect after adding overrides. Most songs need none.

## 9. Check and summarise

```bash
npm run build:songs -- --check
npm test
```

Then report to the owner:

- slug, title, artist, tuning, tempo (and tempo note), bars, duration,
- the chunk list (bars and names) in a compact table,
- the YouTube video (title, channel, id; Songsterr's default, or which alternative and why), the number of sync anchors and the bars the alignment flagged, or why there is no video,
- the Music offset, drift and confidence, or why there is no MP3,
- the album cover (album, year, iTunes id) or why none,
- lyrics: synced from which track, or none (the owner can paste `lyrics.text` into `song.yaml`),
- re-tabs and any overrides, with the reason,
- what to check by ear: tempo interpretation, chunk boundaries you were unsure about, anything the report warned about.
