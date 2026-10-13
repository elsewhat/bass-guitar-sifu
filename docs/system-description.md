# Bass Trainer: system description

Version 0.2 · 2026-09-28 · Status: architecture settled (ADR-0012–0017), implementation starting

## 1. Purpose

A web application for practising bass guitar parts of real songs. It is inspired by the BassBuzz "Beginner to Badass" course (structured practice, small steps) and by Songsterr (scrolling tab synced to a recording). It differs from Songsterr in four ways:

1. Songs are practised in chunks of a few bars. A chunk loops a set number of times (default 3) and then advances automatically, or the player moves on manually.
2. Tempo is adjustable per session, and playback can come from a video, a streaming track, a synthesised rendition, or a spoken count.
3. A silent visual metronome shows when to pluck, which fret to play, and how long the note lasts.
4. Every note has a recommended fretting finger. Recommendations are planned across the whole chunk and the next chunk, so the hand stays in one position where possible.

The application is for one player (the owner) and a small circle of people with access. It is not a public product.

## 2. Scope

In scope for version 1:

- A curated catalogue of 20–30 songs stored as Guitar Pro files in the repository.
- Bass track only. Other tracks are ignored, except as sound: the Synth plays every track, and the Music source plays an MP3 rendered from the whole transcription (ADR-0022).
- 4-string bass in any tuning present in the files (standard, drop D, C♯ standard have occurred).
- Desktop and laptop screens from 1280 px width, shown in the browser's full-screen mode.
- Progress stored in the browser.

Out of scope for version 1: user accounts, a backend, uploading songs from the UI, 5- and 6-string basses, mobile layouts, audio input and pitch detection, editing tab in the app.

## 3. Screen: practice view

The application is a single page that always fits the screen without scrolling. Reference size is 1440 × 900 CSS px (16:10). The design source is in `design/artboards/Main.dc.html`.

Layout grid, top to bottom:

| Row | Height | Content |
|---|---|---|
| Header | 88 px | Song info (left), empty middle, "Songs" button that opens the library (right) |
| Middle | 400 px + 12 px + 64 px | Practice plan column (left, full middle height), video cell with transport bar under it (centre), fingering and metronome column (right, full middle height) |
| Tab | 276 px | Scrolling notation and tab strip, full width |

Gaps are 12 px, page padding 16 px.

### 3.1 Header

- Album cover (64 px, ADR-0026; a music-note placeholder for songs without one), song title, artist, and a metadata line: `110 BPM · 4/4 · Standard E A D G · 243 bars`.
- No lyrics in the header: they are shown in the video cell (§3.3, ADR-0024; owner, 2026-09-30).
- "Songs" button with a `Ctrl K` hint, which opens the song library overlay (section 4).
- Full-screen button at the far right, after the Songs button.

### 3.2 Practice plan (left column)

- Vertical list of the song's chunks. Each row: number circle, chunk name, bar range. The current chunk is expanded and shows `Bars 130–133 · pass 2 of 3` and the current tempo percentage.
- Completed chunks show a check mark and the tempo at which they were completed.
- Ranges where the bass rests are shown as thin separator rows (`Bars 1–129 · bass rests`). They are played, not skipped (§5.1, ADR-0031). A row is a button that starts playback there; the rest being played is white with a green dot.
- The column can be collapsed to a 56 px rail of numbered circles. When collapsed, the video cell widens (619 → 711 px) and the fretboard scales up.

### 3.3 Video cell (centre, top)

- Source switch overlaid top-left: `YouTube · Synth · Music · Metronome` (Spotify deferred, ADR-0016; Music added by ADR-0022, disabled for songs without an MP3). The Metronome is the count source (called Count before 2026-09-29; the code keeps the id `count`).
- YouTube (ADR-0028): the recording as an embedded player that fills the cell, synced to the score bar by bar. Its own controls are off; the transport bar drives it, and a click on the video plays or pauses it with the transport following. It is disabled for a song without a video. "Loading video…" or an error text ("the video may not be played here …") shows over the player. Synth: notes rendered from the score; the cell shows "Synth playback" and loading progress, with no play button of its own (Play is in the transport bar). Music: the song's MP3 rendered from the transcription; the cell shows "Music playback" with "Loading audio… NN %" or "Rendered from the score · full speed only". Metronome: spoken "1 & 2 & 3 & 4 &" from recorded samples, with eight large cells showing the current count position. The Synth, Music and YouTube views show the same cells during a count-in only (§5.6); with YouTube they lie over the video, which is dimmed while the count-in plays.
- Chips: bottom-left "Bass rests · bars 1–129" while a rest is played (ADR-0031); bottom-right the loop's time range, in score time, or in video time with YouTube (`Loop 0:20–0:30 · video time`; `Rest 0:00–4:41 · score time` for a rest).
- Mixer button (equalizer icon) top-right; opens the mixer (§5.5, ADR-0020).
- Lyrics button (subtitles icon) left of the mixer button (ADR-0024, `design/artboards/LyricsView.dc.html`). On by default and kept in the settings; disabled for songs without lyrics. With lyrics on:
  - the source's view shrinks to one row under the source switch, with only the key info: `Audio count` and eight small count cells, or `Synth playback` / `Music playback` with the loading or status text;
  - the lyrics fill the cell between that row and the chips, under the label `Lyrics · synced to the vocal track` or `Lyrics · not synced · ↑ ↓ to scroll`;
  - **synced lyrics** (from the `.gp` vocal track): the line before (16 px, grey), the current line (30 px, weight 800, wraps), the next line (20 px, light grey) and further lines (16 px, grey). In the current line, sung words are white, the word being sung is black on a white box, and words to come are grey. The list glides up as lines change; a line becomes current when the previous line has ended, at most two beats before its first word. Section labels (`Verse 1`) and stanza breaks come from the lyrics text in the file;
  - **unsynced lyrics** (from `lyrics.text` in `song.yaml`): every line white at 20 px, no word highlight and no automatic scroll. `↑` / `↓` and the mouse wheel move one line.
  - With YouTube, synced lyrics are a subtitle band over the video, above the chips: the current line (20 px, the same word states) and the next line. Unsynced lyrics are not shown over the video, and the lyrics button is disabled for them while YouTube is the source (ADR-0028).

### 3.4 Transport bar (under the video only)

Left to right:

1. Play/pause (primary, accent green circle). Play starts with a one-bar count-in (§5.6).
2. Restart chunk.
3. Pass counter and repeat button. The button cycles three modes (ADR-0021): repeat each chunk N times, then advance (repeat arrows, green, with pass dots and `2/3`); play through, each chunk once (arrow to a bar, green, `Play through`); loop this chunk (repeat-one icon, white, `Pass 5`). Play through is the default (owner, 2026-09-29).
4. Tempo control: `−`, `95%` with `105 BPM` under it, `+`. Steps of 5 %, range 40–100 %, starting at 100 % (owner, 2026-09-29). Locked at 100 % while the source is Music; the chosen tempo returns on the other sources (ADR-0022).
5. "Next chunk" button.

There is no automatic tempo ramp.

Keyboard (owner, 2026-09-30): `Space` play/pause, `←` / `→` previous / next chunk, `+` / `−` tempo (`=` and `_` also work), `↑` / `↓` scroll unsynced lyrics. The keys are ignored while the song library or the mixer is open and while a form field has focus. Space always means play/pause, even when a button has focus. The button tooltips show the keys.

### 3.5 Fingering and metronome column (right)

Top: fretboard diagram with a hand.

- Horizontal neck, frets 0–9 (scaled to fit), strings drawn in their string colours with coloured letter badges (E A D G).
- A shaded band marks the current hand position (four frets). Fret numbers inside the band are bold.
- Four finger capsules rise from a palm shape under the neck. The active finger is filled with the target string's colour, reaches the target string and shows its number. Inactive fingers are translucent.
- The next different note is marked with a dashed ring labelled "Next".
- Open strings: a filled circle at the nut in the string colour, labelled 0.

Bottom: two equal squares, "Now" and "Next".

- "Now" shows only the fret number (128 px, weight 800) on a background in the current string's colour. On each pluck it shows at full colour and fades to 28 % opacity over 90 % of the note's duration, so an eighth note fades quickly and a whole note stays lit for most of the bar. The number changes from the string's text colour to white as it fades.
- "Next" shows the next *different* note (not the next pluck) at full string colour, with `in 6` (plucks until the change), `next chunk` or `loop` in the top-right corner. It does not fade.
- Chords and double stops (owner, 2026-09-30) are shown as stacked tab rows. The square is split into one band per note, highest string on top. Each band is in its string's colour and shows the fret number (or `x`); the font is 88 px for two notes, 64 px for three and 48 px for four. The Now square fades as a whole. A power chord or an octave is named in the label, `Now · D5`. "Next" compares every note of the chord, so a change on any string is the next different note.
- On the fretboard every fretted note of a chord lights its finger. A finger that holds several strings on one fret (a barre) reaches the highest of them and shows a dot on the others. Open notes get the circle at the nut, and every note of the next chord gets a dashed ring, with one "Next" label. The hand position comes from the chord's fretted notes, even when its lowest note is an open string.

### 3.6 Notation and tab strip (bottom)

- Fixed left gutter (72 px): bass clef, time signature, `TAB` label, string badges G D A E in string colours.
- Scrolling content: bar numbers, standard notation (bass clef, written one octave above sounding pitch, which is the convention for bass), and a 4-line tab.
- Tab notes are filled circles in the string colour with the fret number inside (20 px; 26 px with a white ring for the current note).
- A fixed playhead, a single 2 px line in the green accent (owner, 2026-09-29; it replaced a white band), sits 150 px from the left edge of the scrolling area, so four eighth notes fit to its left. The content scrolls under it. A note is within 10 px of the line when it is plucked: that is when its count sounds and it gets the ring.
- The current loop is marked by a green bracket above the bars with a label: `Loop · chunk 1 · Riff A · bars 130–133 · pass 2 of 3`. Bars outside the loop are dimmed. The first bars of the next chunk are shown dimmed with a label.
- Where the fingering engine re-tabs a note (same pitch, different string), a small blue label above the bar says `Retab · source A1`.
- No finger numbers in the tab.
- The notation is not highlighted. The current note is marked only in the tab, by the ring.
- Rendering (ADR-0017): alphaTab engraves the notation and tab. Our overlays draw the circles, ring, bracket, dimming and labels, and our code draws the gutter and playhead. The strip scrolls with the "smoothed over 2 beats" mapping, bounded so that notes are within 10 px of the playhead centre when plucked. The speed has no jumps.

### 3.7 String colours

Palette "dark to light" (ADR-0009). Colours get lighter from the lowest to the highest string.

| String | Fill | Text on fill |
|---|---|---|
| E (lowest) | `#7c3aed` violet | white |
| A | `#0ea5e9` sky blue | black |
| D | `#f59e0b` amber | black |
| G | `#fde047` light yellow | black |

For tunings other than standard, colours follow string position (lowest string is violet), not note names.

## 4. Song library overlay

Opened from the header button. Full-screen dim backdrop, centred panel 960 × 640 px (`design/artboards/SelectorOverlay.dc.html`).

- Large search field (title or artist) and a close button.
- Filter chips: `All`, then the three artists with the most songs, with the count in parentheses, e.g. `Motorpsycho (4)`. Recomputed from the catalogue. One artist filter at a time; clicking an active chip clears it.
- Result count at the right.
- Three-column grid of song cards (148 px high): title, artist, `BPM · length · frets 0–N`, tuning badge (`Standard` grey, other tunings orange such as `Drop D` or `C♯ standard`) followed by the string names, and a progress bar with text (`Chunk 3 of 9`, `Not started`). The current song has a green ring and `Playing · …`.
- Selecting a card loads the song and closes the overlay. The song always starts at bar 1, also when it is the song that is playing (ADR-0031); its done chunks and tempo are kept (ADR-0010). A song never practised shows `Not started`.
- `Ctrl K` / `Cmd K` opens the overlay and `Esc` closes it.

## 5. Practice behaviour

### 5.1 Loop and advance

- The player selects a chunk. A song starts at bar 1: in the rest before the first chunk when the bass enters later, else in the first chunk. A reload continues at the stored chunk or rest.
- Playback loops the chunk's bars. Each full loop increments the pass counter.
- When the pass counter exceeds the target passes (default 3) and auto-advance is on, the chunk is marked done with the tempo used, the next chunk starts, and the pass counter resets to 1.
- "Next chunk" advances immediately without marking the chunk done.
- "Restart chunk" returns to the chunk start and keeps the pass count.
- Selecting a chunk, "Next chunk" or "Restart chunk" while playing starts again with a count-in (§5.6). Passes, auto-advance and play-through continue without one.
- On the last chunk, auto-advance marks the chunk done after its passes and keeps looping it. With auto-advance off, the pass counter keeps counting past the target.
- The loop decides where to continue when the wrap is scheduled, ahead of the audio, so the next pass or chunk starts without a gap (ADR-0018).
- In play-through mode (ADR-0021) each chunk is played once and the next chunk starts directly. After the last chunk playback stops: the chunk is marked done and stays selected, positioned at its start.
- Bars in tacet ranges are never part of a chunk. They are rests, and they are played (ADR-0031):
  - A rest is the bars between two chunks, before the first chunk or after the last one. It is played once in every repeat mode, never looped and never marked done.
  - When a chunk has had its passes, playback runs on through the rest after it and into the next chunk, without a seek or a count-in.
  - In play-through mode the rest after the last chunk is played as well, and playback stops at the end of the song with that rest selected.
  - While a rest is played, the strip's bracket spans it with the label `Bass rests · bars 177–191`, the pass counter reads `Bass rests`, the Now square is empty and the Next square shows the first note of the next chunk.
  - "Next chunk" from a rest selects the chunk it leads into; "previous chunk" the chunk before it.

### 5.2 Visual metronome

- Fires on every note onset (pluck), not on every beat.
- Fade duration = 0.9 × note duration at the current tempo. Tied continuations do not trigger a new pluck.
- Rests: the "Now" square shows a neutral dark state with no number.

### 5.3 Tempo

- Effective BPM = score BPM × tempo %. Score tempo comes from the Guitar Pro tempo map (automation events).
- YouTube: the tempo is the player's playback rate. The IFrame API takes any rate from 0.25 to 2 (measured 2026-10-11), so the control works as for the Synth, 40–100 % in steps of 5; the sound keeps its pitch. The clock follows the rate the player reports (ADR-0028).
- Spotify (deferred, ADR-0016): the Web Playback SDK has no playback-rate control.
- Synth and Metronome: any tempo.
- Music (ADR-0022): full speed only. The tempo control shows 100 % and the score BPM and is disabled; passes count as done at 100 %.

### 5.4 Metronome (count source)

- Two mixer channels that can sound together (ADR-0020): **Click**, a short tone on every count with an accent on beat 1, and **Voice**, the recorded samples below. While the samples are missing, only the click plays and the mixer shows Voice as "No samples".
- Voice plays one sample per eighth-note position: `one`, `and`, `two`, `and`, `three`, `and`, `four`, `and`, using the bar's time signature (other meters count the corresponding beats).
- Samples are WAV files in `public/audio/count/`, scheduled with the Web Audio API using a look-ahead scheduler so timing does not depend on `setTimeout` accuracy.
- The eight count cells in the video area highlight the current position, including during sustained notes.

### 5.6 Count-in (ADR-0025)

- Playback always starts with one bar of metronome counts: on Play, and on a chunk change or restart while playing (owner, 2026-09-30). Passes, auto-advance and play-through do not count in, so a play-through has no gaps.
- The counted bar has the meter and tempo (× the tempo setting) of the bar playback starts in, and ends where playback starts: `1 2 3 4` into a bar start, `3 4 1 2` into beat 3 after a pause mid-bar. Only the beats are sounded, with the Metronome's click (accent on 1) and voice samples, for every source.
- The count-in follows the mixer's Metronome channels (Click, Voice) and the master. The strip, the Now square, the fretboard and the lyrics wait at the start position; the count cells light the eighth being counted. Pause cancels the count-in.

### 5.5 Mixer (ADR-0020)

- Opened from the equalizer icon in the video cell. Modal with the song library's shell: dim backdrop, centred 680 px panel, closes on backdrop click, the close button and `Esc`.
- Master row (mute, 0–100 % slider) for all sources, then tabs `YouTube · Synth · Music · Metronome`. The active source's tab is selected on open and marked with a green dot.
- Channels: YouTube `Video`; Synth one row per `.gp` track with mute and solo, the bass marked "Your part", and Quick mix buttons `Bass only`, `Full band`, `Backing`; Music one `Music` row (the render is one stereo mix); Metronome `Click` and `Voice`, which can sound together.
- A muted channel keeps its slider value. Values are stored in the browser (§9).

## 6. Song pipeline

Guitar Pro files are the source of truth for notes. A build step turns each song folder into a JSON file the app loads at runtime (ADR-0003, ADR-0004).

```
music/<Artist-Title-date>.gp  Inbox (+ .mp3 rendered from it); /preprocess-song moves both into songs/<slug>/ (ADR-0015)
songs/<slug>/score.gp         Guitar Pro file (GP3–GP8)
songs/<slug>/audio.mp3        Optional audio rendered from the transcription, the Music source (ADR-0022)
songs/<slug>/cover.jpg        Optional 300 px album cover for the header, from npm run fetch-cover (ADR-0026)
songs/<slug>/song.yaml        Sidecar: metadata, chunks, media + sync (npm run fetch-video, ADR-0028), overrides (ADR-0013)
        │  npm run build:songs  (Node; run locally and committed, CI runs --check; ADR-0014)
        ▼
public/data/catalog.json       List of songs for the library overlay
public/data/songs/<slug>.json  Normalised bass track + chunks + fingering
<base>data/scores/<slug>.gp   score.gp served/copied by the song-scores Vite plugin, not committed twice (ADR-0017)
<base>data/audio/<slug>.mp3   audio.mp3, the same way, with byte ranges in dev (ADR-0022)
<base>data/covers/<slug>.jpg  cover.jpg, the same way (ADR-0026)
```

### 6.1 Normalised song JSON (generated)

```jsonc
{
  "slug": "vortex-surfer",
  "title": "Vortex Surfer",
  "artist": "Motorpsycho",
  "track": { "index": 1, "name": "Electric Bass (finger)" },   // the bass track in the .gp file
  "tracks": ["Distortion Guitar", "Electric Bass (finger)", "Drums"],   // every track, for the Synth mixer
  "tuning": [28, 33, 38, 43],          // MIDI pitch per string, lowest first
  "tuningName": "Standard",
  "ppq": 960,                           // ticks per quarter note
  "tempoMap": [{ "bar": 1, "tick": 0, "bpm": 110 }],
  "bars": [{ "n": 1, "time": [4, 4], "startTick": 0, "durTicks": 3840, "section": null }],
  "events": [                           // one per beat; `notes` holds double stops
    { "id": 0, "bar": 130, "tick": 0, "start": 495360, "dur": 480, "kind": "note",
      "notes": [{ "string": 0, "fret": 6, "pitch": 34, "tieFromPrev": false, "dead": false,
                  "finger": 4, "position": 3, "retabFrom": { "string": 1, "fret": 1 } }] },
    { "id": 1, "bar": 177, "tick": 0, "start": 675840, "dur": 3840, "kind": "rest", "notes": [] }
  ],
  "tacet": [[1, 129], [177, 191], [241, 243]],
  "chunks": [{ "id": 1, "name": "Riff A", "bars": [130, 133], "position": 3, "shifts": 0 }],
  "stats": { "durationSec": 530.2, "noteCount": 692, "maxFret": 6, "strings": [0, 1], "firstBar": 130 },
  "media": { "youtube": { "videoId": "ENZaFo2cEog", "sync": [{ "bar": 1, "ms": 0 }, { "bar": 2, "ms": 2190 }] },   // ADR-0028
             "music": { "url": "data/audio/vortex-surfer.mp3", "offsetMs": 0 } },   // null without an MP3
  "tempoNote": null,
  "cover": { "url": "data/covers/vortex-surfer.jpg", "album": "Trust Us" },   // only with cover.jpg (ADR-0026)
  "lyrics": { "synced": true, "source": "Lead Vocals",   // only for songs with lyrics (ADR-0024)
              "lines": [{ "text": "word word", "section": "Verse 1", "gap": false,
                          "words": [{ "text": "word", "start": 26880, "end": 27360 }] }] },
  "playOrder": [0, 1, 2, 2, 3]          // only for scores with repeats (ADR-0023)
}
```

Types are in `src/core/model.ts`. The fields work as follows:

- Bar numbers are played bars. A score with repeat signs, alternate endings or D.S./D.C./coda is unrolled into the order it is played (ADR-0023). `playOrder` then gives the written bar index (0-based) of each played bar, and the strip unrolls the `.gp` with it. Songs without repeats have no `playOrder`.

- `noteCount` counts plucks, so tie continuations are excluded and dead notes are included.
- `maxFret` is the highest fret after re-tabbing.
- Dead notes keep their source tab and have `finger: null`.
- An open-string note has `finger: 0` and `position: null`.
- `lyrics` (ADR-0024): synced lyrics come from the vocal track (the track with the most sung syllables, or `lyrics.track`); each word has absolute start and end ticks in played order. Unsynced lyrics come from `lyrics.text` in `song.yaml` and have `words: []`. `section` is a `[…]` comment line above the line and `gap` a blank line before it.

### 6.2 Sidecar `song.yaml` (ADR-0013)

Written by the `preprocess-song` skill and edited by hand. It is validated against `schemas/song.schema.json`.

```yaml
# yaml-language-server: $schema=../../schemas/song.schema.json
title: Vortex Surfer
artist: Motorpsycho
source: { file: "Motorpsycho-Vortex Surfer-10-13-2025.gp", date: 2025-10-13 }
bassTrack: "Electric Bass (finger)"   # track name or zero-based index
tempo: { note: null }                 # e.g. "notated half-time"
media:
  youtube:                            # written by npm run fetch-video (ADR-0028)
    videoId: ENZaFo2cEog              # the video Songsterr plays with the tab
    songsterr: { songId: 2582753, revisionId: 3403501 }   # where the video and the sync come from
    sync: [
      { bar: 1, ms: 0 }, { bar: 2, ms: 2190 }, { bar: 3, ms: 4410 },   # … one anchor per bar
      ]
  music: { source: "Motorpsycho-Vortex Surfer-09-29-2026.mp3", offsetMs: 0 }   # ADR-0022
chunks:                               # required; the build does not invent chunks
  - { name: Riff A, bars: [130, 133] }
fingeringOverrides: []                # { bar, tick, string?, fret?, finger? }
lyrics:                               # optional (ADR-0024)
  source: score                       # score | text | none (default: score if it has lyrics, else text)
  track: 0                            # vocal track name or index (default: most sung syllables)
  text: |                             # unsynced lyrics, for scores without a vocal track with lyrics
    [Verse 1]
    first line of the verse
    second line

    [Chorus]
    …
notes: ""                             # review notes from the skill
```

`sync` is a list of anchors from score bar (and optional `tick` inside the bar) to recording time, in order. Between two anchors the recording time is interpolated linearly over score time; before the first and after the last the recording runs at the score's tempo (`src/core/sync.ts`). One anchor is an offset: the place in the video where the music starts. `npm run fetch-video -- <slug> --write` writes `videoId`, `songsterr` and `sync` from Songsterr: the tab's default video and its video time for every bar start. Real recordings drift by seconds from the tempo map, so the songs have an anchor on nearly every bar; bars without one are noted in `notes`. The build rejects anchors outside the score or out of order. Where Songsterr's points are off, the anchors are bar starts measured in the recording instead, and `notes` say so (ADR-0029: the three Vortex Surfer songs). Six songs have no tab at all: their bass part and their anchors were both read from the recording with the tools in `scripts/transcribe/`, and their `notes` say so (ADR-0030: the Roadwork Vol. 1 songs).

`music` needs `songs/<slug>/audio.mp3`. `offsetMs` is the audio time of the score's first tick, measured once with `npm run inspect-song -- <slug> --audio songs/<slug>/audio.mp3`, which also reports drift between the first and last minute.

## 7. Algorithms

### 7.1 Chunking (ADR-0006, amended by ADR-0015)

The final chunks are written by the `preprocess-song` skill into `song.yaml`. Code computes steps 1–4 as a draft in `npm run inspect-song`. The skill decides the boundaries and names (step 5), and the build uses only the sidecar chunks.

1. Mark tacet bars (bars that contain only rests in the bass track). A bar that only sustains a note tied from the previous bar is not tacet; Vortex Surfer bars 234–240 hold one tied D and belong to the Outro chunk. Consecutive tacet bars form a tacet range.
2. If the file has section markers, use them as the top level. Otherwise the whole playable range is one section.
3. Inside each section, compute a signature per bar (sequence of string, fret, duration, tie flags). Split into phrases of 2–8 bars (target 4), preferring boundaries where the signature pattern repeats or changes.
4. Merge an immediate repeat of the previous phrase into one chunk named `<name> ×2`.
5. The agent names the chunks musically. It uses section names where present (`Verse 1`, `Verse 1 b`), otherwise descriptive names (`Riff A`, `Climb`, `E pedal`), and reuses a name for identical phrases.

### 7.2 Fingering (ADR-0007)

Dynamic programming over the note sequence of the playable range (not per chunk, so the next chunk is planned for):

- State per note: (string, fret, finger, hand position p). Candidates include every string and fret that produces the same pitch within frets 0–(maxFret + 2), so re-tabbing is possible.
- Hand position p is the fret under the index finger. In positions 1–5 the hand covers three frets 1-2-4 (the ring finger supports the little finger). Higher up it covers four frets, one finger per fret. Open strings keep the current position.
- Sparse passages (fewer than 3 different fretted notes in the current and next bar) lead with the index finger. Dense passages use the whole box.
- Without a break, the little finger takes the far note (up or down) instead of shifting. After a rest, dead note or open string, small shifts are cheap, so the index moves to the note.
- No finger rolling to another string at the same fret, except the little finger between the two top strings. A same-fret double stop is a barre and is allowed.
- Costs: position shift (proportional to distance, cheaper in a break or when the same finger slides along the string), string change, re-tab away from the source string/fret, finger effort (strong in sparse passages, a tie-break in dense ones), rolling, open string (small bonus below fret 5).
- Repeated identical notes keep the same fingering.
- Output: finger, position, `retabFrom` when the chosen string/fret differs from the file.
- Sidecar `fingeringOverrides` pins individual notes and the solver plans around them.

The pseudo code and cost values are in ADR-0007. The fingering for Vortex Surfer bars 130–176 in `reference/vortex-surfer-chunks.json` (revised 2026-09-29 for the beginner rules) is the expected result for tests.

## 8. Playback and timing (ADR-0008)

One `PlaybackClock` interface drives the UI. Implementations: `YouTubeClock`, `SynthClock`, `MusicClock`, `CountClock`. The Synth is an adapter over the alphaTab player (ADR-0017, ADR-0019); YouTube and Music have their own clocks over a small player port (ADR-0022, ADR-0028).

- The clock reports the current score position as an absolute tick, read once per animation frame (ADR-0018).
- The YouTube clock maps video time to score position through the sync map (§6.2). It works in video time and converts at the edges.
- Loop: at the chunk end the clock continues with the range the loop controller returns (the same chunk or the next one) and emits `passCompleted` when the wrap is heard (ADR-0018).
- YouTube (ADR-0028): the player is the IFrame API with its own controls off. It cannot loop a range, so the clock seeks at the chunk end, as Music does; a chunk that continues right after the current one needs no seek.
  - A started or moved video is heard again after about 50 ms, but the player reports "playing" only 250–300 ms later. The clock runs on from the target meanwhile and corrects when the report comes; with no report after 0.6 s it waits at the target.
  - Right after a seek the player still reports the old position; reports that do not fit the seek are ignored for 1.5 s, so a wrap is not counted twice.
  - The position is held while the video buffers, and it never leaves the chunk: it waits at the chunk start until the video passes it.
  - A click on the video pauses or plays it; the clock follows and the Play button with it.
  - Measured against the real player: the tick is within 2 ms of the video's time while playing and within about 10 ms after a wrap; a wrap has a gap of about 50 ms.
- The Metronome schedules audio with the Web Audio API clock (look-ahead of about 100 ms, scheduling interval about 25 ms).
- `play({ countIn: true })` plays the one-bar count-in first (ADR-0025). The Metronome schedules it on its own audio clock; the Synth and Music start their player when the count-in's end is due. The YouTube video is made ready at the start position while the count-in plays (a video that has never played is run muted for a moment and paused there) and is started 50 ms before the count-in ends, so it is heard on the downbeat. `getTick()` stays at the start during the count-in, and `countInState()` feeds the count cells.
- Music streams `data/audio/<slug>.mp3` through `<audio>` and Web Audio. Audio time = score time + `offsetMs`; the clock seeks at chunk wraps, accurate to tens of milliseconds (ADR-0022).
- Synth is alphaTab's player on the strip's alphaTab instance, loaded when the Synth is first chosen. It plays the bass track alone by default; full band and band without bass are prepared (ADR-0019).
- While playing (count-in included) the page holds a screen wake lock, so the screen does not dim or lock; it is released on pause and requested again when the page becomes visible (ADR-0027).

## 9. Persistence (ADR-0010)

- `localStorage` key `bass-trainer:v1:<slug>`: current chunk (and the rest next to it, when the song was left in one; ADR-0031), passes, tempo, source, completed chunks with tempo, last practised timestamp, Synth track mix (`synthTracks`).
- `bass-trainer:v1:settings`: passes per chunk, repeat mode, practice plan collapsed, last song, mixer (master, YouTube, Music and Metronome channels), lyrics on or off (`lyricsOn`).
- Settings dialog offers export and import of all progress as a JSON file.

## 10. Hosting and repository (ADR-0012)

- Static site built with Vite and deployed by a GitHub Actions workflow to GitHub Pages at `https://elsewhat.github.io/bass-guitar-sifu/`.
- Public repository and public site. There is no access control.
- All songs, sidecars, generated data (ADR-0014) and count samples are committed to the repository.

## 11. Catalogue at design time

Extracted from the six Guitar Pro files provided during design.

| Song | Artist | BPM (file) | Tuning | Length | Bars | Bass notes | Max fret | Sections in file |
|---|---|---|---|---|---|---|---|---|
| Vortex Surfer | Motorpsycho | 110 | E A D G | 8:50 | 243 | 692 | 7 | none |
| The Wheel | Motorpsycho | 122 | C♯ F♯ B E | 18:55 | 577 | 3263 | 16 | none |
| Un Chien d'Espace | Motorpsycho | 98 | E A D G | 14:26 | 357 | 763 | 8 | Prelude, Intro |
| wearing yr smell | Motorpsycho | 137 | E A D G | 3:30 | 120 | 747 | 17 | none |
| Creep | Radiohead | 92 | E A D G | 3:57 | 91 | 429 | 12 | 8 (Intro … Chorus) |
| Black Hole Sun | Soundgarden | 53 | D A D G | 5:23 | 79 | 434 | 8 | 11 (Intro … Ending) |

Notes:

- Bass enters at bar 130 in Vortex Surfer, bar 32 in Un Chien d'Espace, bar 5 in Black Hole Sun.
- Black Hole Sun and Un Chien d'Espace change time signature (2/4, 3/4, 4/4, 5/4, 9/8 occur).
- Rhythms in the bass tracks range from whole notes to 32nd notes, with dotted notes and ties. No tuplets occur in these six files, but the renderer must support them.
- Black Hole Sun is notated at 53 BPM. Check this against the recording when creating its sync map; the file may be notated in half time.

## 12. Implementation milestones

Work proceeds in vertical slices. The first slice uses two songs: Vortex Surfer, the acceptance fixture, and one Rage Against the Machine song added through the skill.

1. Scaffold: Vite, React, TypeScript and Tailwind, with tokens as CSS variables. A GitHub Actions workflow runs the build and tests and deploys to Pages. An empty practice layout at 1440 × 900 with a full-screen button.
2. Pipeline core:
   - `gp-import` (alphaTab in Node) produces the normalised model.
   - Tacet detection and draft chunks.
   - The fingering solver.
   - The `inspect-song` and `build-songs` scripts.
   - Tests against `reference/vortex-surfer-chunks.json` and the catalogue values above.
3. `preprocess-song` skill. First runs: Vortex Surfer and one RATM song.
4. Slice 1 practice view:
   - The strip, built from the accepted alphaTab spike (ADR-0017). Done 2026-09-28 (`src/strip/`).
   - Fretboard, Now/Next squares and practice plan.
   - `CountClock`, loop, passes, auto-advance, tempo control and the visual metronome fade.
5. Broaden:
   - Remaining songs through the skill.
   - Song library overlay and progress persistence.
6. YouTube source with sync map (ADR-0028, done 2026-10-11). The sync comes from Songsterr through `npm run fetch-video`; the tap sync editor of ADR-0016 is not built.
7. Synth source.
7b. Music source: MP3 rendered from the transcription, full speed only (ADR-0022).
8. Spotify source: deferred (ADR-0016).
