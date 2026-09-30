# ADR-0024: Lyrics from the Guitar Pro vocal track and from song.yaml

Status: Proposed (implemented, awaiting owner review)
Date: 2026-09-30
Amends: ADR-0011 and ADR-0012 (lyrics may be stored and published), ADR-0013 (`lyrics` in `song.yaml`), ADR-0003 (`lyrics` in the song JSON).

## Context

- ADR-0011 kept lyrics out of the repository, and the header's lyrics block stayed empty unless a licensed provider was added. The owner has decided (2026-09-30) that the lyrics may be shared, like the `.gp` files they come in.
- 10 of the 17 Guitar Pro files have a vocal track with lyrics. Each sung note carries its syllable (`beat.lyrics` in alphaTab), so the lyrics are already timed to the score, and their timing follows loops, tempo changes and repeats.
- alphaTab keeps only the per-beat syllables. The track's lyrics text, which holds the line breaks and the `[Verse 1]` comments, is dropped once the syllables are placed on the beats. Two files (Killing in the Name, Bulls on Parade) have no line breaks in that text.
- Songs without a vocal track in the score can still have lyrics, typed or pasted by the owner, but with no timing.
- The design (`design/artboards/LyricsView.dc.html`, `Main.dc.html` `lyricsFull`) shows the lyrics in the video cell: a small row with the source's status under the source switch, then the line before (small, dim), the current line (30 px, word by word), and the next two lines. A toggle next to the mixer button turns the view on and off. With YouTube, the lyrics become a subtitle band over the video.

## Decision

- **Two kinds of lyrics.**
  - **Synced**: from the vocal track of `score.gp`. Every word has a start and an end tick. The current word is lit and the view scrolls by itself.
  - **Unsynced**: from `lyrics.text` in `song.yaml` (owner, 2026-09-30: the sidecar holds everything per song besides the score and the MP3). It is a YAML block scalar (`text: |`) with one line per lyric line, blank lines between stanzas, and `[Chorus]` lines as section labels. No word is lit and there is no automatic scroll; `↑` / `↓` (and the mouse wheel) move one line.
- **Choice per song.** By default, synced lyrics from the score win. If the score has none, `lyrics.text` is used. `song.yaml` can override this with `lyrics: { source: score | text | none, track: <name | index> }`. The default vocal track is the one with the most sung syllables, so lead vocals win over backing vocals.
- **Build** (`scripts/lib/gp-lyrics.ts`, `src/core/lyrics.ts`):
  - The syllables are read from the vocal track's first voice, in played order (ADR-0023). A syllable lasts over its beat and over any following notes without a syllable of their own (ties and slurs); a rest ends it.
  - The track's lyrics text is read from `Content/score.gpif` inside the `.gp` zip (Guitar Pro 7 and later).
  - `lyricChunks` cuts that text into syllables by the same rules as alphaTab: spaces and line breaks end a syllable, `Ki-lling` is two syllables of one word, each extra dash is a held syllable (`oh--` → `oh-`, `-`), and `[…]` is a comment. It also records each syllable's line. For all 14 vocal tracks in the current files, the text syllables match the beat syllables one to one.
  - `syncedLyrics` joins the syllables into words and groups the words into lines:
    - when the text matches and has line breaks, from the text's lines, with its section comments and stanza breaks;
    - otherwise, and within text lines longer than 12 words, by `LINE_SPLIT`: a quarter rest or a sentence end after 4 words, a capitalised word (not "I") after 3 words, a comma after 6 words, and at most 12 words;
    - a rest of a whole bar (4 quarters) always ends a line, never inside a word;
    - a repeat that plays the same syllables again starts a new line.
  - The build warns when a song's lines come from timing rather than the text.
- **Song JSON** gets an optional `lyrics: { synced, source, lines: [{ text, section, gap, words: [{ text, start, end }] }] }`. Ticks are absolute and in played order. Unsynced lines have `words: []`. Songs without lyrics have no `lyrics` field, so their JSON did not change.
- **View** (`src/components/Lyrics.tsx`, styles `.lyrics-line` in `src/styles/index.css`):
  - With lyrics on, the video cell shows the design's lyrics layout: the source switch, the lyrics toggle and the mixer button at the top; one row with the source's key info (small count cells, or the Synth or Music status); the lyrics; and the two chips at the bottom. The large count cells and status text are replaced. The header shows no lyrics (the design's header lyrics block is not used).
  - Synced: `lyricsCursor` (a binary search over `lineSwitchTicks`) gives the current line and word per frame, through the frame loop (ADR-0002, ADR-0008). The DOM is changed only when they change. A line becomes current when the previous line's last word has ended, but at most two beats before its own first word, so it can be read ahead. The list glides (300 ms) so the current line stays 38 px from the top, with the line before it above.
  - Word states: sung (white), being sung (white box, black text), to come (grey). Other lines are one line high and cut with an ellipsis; the current line wraps.
  - Unsynced: all lines white at 20 px. `↑` / `↓` move one line, and the list stops once the last line is in view. The arrows do nothing for synced lyrics.
- **Toggle.** A lyrics button to the left of the mixer button (design position). It is on by default, and the choice is kept in `bass-trainer:v1:settings` as `lyricsOn` (ADR-0010). It is disabled for songs without lyrics.
- **Content (amends ADR-0011 and ADR-0012).** Lyrics from the `.gp` files and in `lyrics.text` are stored in the repository and published on Pages, with the same status as the `.gp` files. The owner accepts that they may have to be removed after a takedown request. Recordings are still never downloaded.

## Consequences

- Ten songs have synced lyrics with no extra work, and new songs get them when their transcription has a vocal track.
- The timing is only as good as the transcription's vocal part. A vocal line that is not transcribed has no lyrics, even if the song is sung there.
- The `.gpif` text is read with a small zip reader of our own (`unzipEntry`), because alphaTab does not export its zip reader or the track text. Older formats (`.gp5`, `.gpx`) give syllables but no text, so their lines come from timing.
- Line cutting by timing is a heuristic. A bad line break can be fixed in the `.gp` file's lyrics text (line breaks), or by writing `lyrics.text` and setting `lyrics.source: text`.
- The YouTube source (on hold) should show the lyrics as the design's subtitle band over the video: the current line and the next line.
- The `preprocess-song` skill reports the vocal track and the lyrics source. It does not look up or write `lyrics.text`: lyrics of commercial songs are copyrighted text, so Claude does not reproduce them. The owner pastes them in.

## Alternatives considered

- **Keep the header lyrics block** (`Main.dc.html` header, "synced per bar"). The header has room for one line and the next, and no word timing. The owner chose the video cell ("use the player section for the lyrics").
- **Lines from the syllables alone** (split at rests). This works, but the transcriber's own lines and section comments read better when they exist, so they are used first.
- **A separate `songs/<slug>/lyrics.txt`** (the first version). Plain text is a little easier to paste, but the owner wants the sidecar to hold it, next to the other per-song data; a YAML block scalar needs only an indent.
- **Lyrics from an online provider at runtime** (a licensed API). This would need a key and a backend (ADR-0012: static files only), and would not be timed to the score.
