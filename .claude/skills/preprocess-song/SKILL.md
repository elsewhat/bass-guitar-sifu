---
name: preprocess-song
description: Add a Guitar Pro file (and its rendered MP3) from the music/ inbox to the Bass Trainer catalogue. Inspects the file, moves it to songs/<slug>/score.gp (+ audio.mp3), writes song.yaml (metadata, named practice chunks, YouTube id, Music offset, fingering overrides) and regenerates public/data. Use when the user wants to add, import or preprocess a song, or runs /preprocess-song [file].
---

# preprocess-song

Turns `music/<Artist-Title-MM-DD-YYYY>.gp` (and the MP3 rendered from it, if present) into `songs/<slug>/score.gp` + `audio.mp3` + `song.yaml` and regenerates `public/data/` (ADR-0013, ADR-0014, ADR-0015, ADR-0022). Deterministic work is done by scripts; your job is the judgment: naming, chunking, finding the recording, and reviewing the fingering.

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
- **Tempo note**: if the report warns about half/double time, or the rhythm is dominated by very short or very long notes for the style, write a one-line `tempo.note` (e.g. `Notated in half time (53 BPM); the recording is about 106 BPM.`). Check against the recording's actual tempo when you find it in step 4.

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

## 4. Find the recording

Search the web for the official recording on YouTube (`<artist> <title> official`), preferring, in order:

1. the artist's official channel or VEVO,
2. the "<Artist> - Topic" auto-generated channel ("Provided to YouTube by …"),
3. the label's channel.

Avoid covers, live versions, lyric videos by third parties and bass covers. The recording should be the version the tab follows: compare its length with the report's duration and its tempo with the tempo map.

Verify the id before writing it:

```bash
curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json"
```

The title and author_name must match. If nothing trustworthy is found, write `videoId: null` and say so in the summary.

With an MP3, use its tempo to confirm the `tempo.note` (it follows the tempo map exactly; the recording may not).

Leave `sync: []`. Sync anchors are tapped in the app's sync editor (ADR-0016), not guessed.

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

## 7. Build

```bash
npm run build:songs -- --only <slug>
```

Fix every error. Treat warnings (overrides pointing at no note, chunks containing tacet bars) as things to fix or explain in `notes`.

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
- the YouTube video found (title, channel, id) or why none,
- the Music offset, drift and confidence, or why there is no MP3,
- re-tabs and any overrides, with the reason,
- what to check by ear: tempo interpretation, chunk boundaries you were unsure about, anything the report warned about.
