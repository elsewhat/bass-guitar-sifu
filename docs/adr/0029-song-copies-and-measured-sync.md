# ADR-0029: Copies of a song, and sync measured in the recording

Status: Proposed (implemented, awaiting owner review), amended by ADR-0030 (the measuring scripts are now in `scripts/transcribe/`, and more songs have measured anchors)
Date: 2026-10-11
Amends: ADR-0028 (where the sync comes from when Songsterr's points are off), ADR-0011 (a recording fetched for measuring), ADR-0013 (`media.youtube.songsterr`), ADR-0015 (a slug per copy, a derived score).

## Context

- The owner reported (2026-10-11) that Vortex Surfer with YouTube does not work: the tab trails the video, and the tab has no bass for the first minutes of the song. The owner asked for other sources of the bass tab that fit a YouTube video better, allowed several copies of the song in the library for comparing, and suggested analysing the recording itself.
- **There is no transcription by a person.** Songsterr has one tab for the song (song 2582753) and it is AI-generated (`aiGenerated`, one revision, 2025-10-13). The file in the inbox was Songsterr's AI retranscription of the same tab. The rest of the web has a chord sheet written by ear (nortabs.net, guitar chords) and automatic chord sites. No bass tab, no Guitar Pro file, no bass cover with a tab.
- **Songsterr's points for this tab sit on the wrong beats.** Measured against the recording:
  - they are on its eighth notes, within about 20 ms, for most of the song;
  - but every bar starts a quarter note after the real bar start up to bar 176, and an eighth note after it from bar 192. The beat tracker slipped by an eighth in the quiet break.
  - The tab's pitch changes therefore came 0.55 s and 0.27 s after the bass's.
- **The tab's notes are right from bar 130.** The root of every bar from 130 to 240 is the one the bass plays in the recording, and the tab's 243 bars of 4/4 are the recording's bars.
- **Before bar 130 the recording has no bass line of its own.** The lowest voice is a guitar's low strings (B2, A2, E2, G2). Nothing sounds below 80 Hz except the kick drum from 3:03. Both AI transcriptions have no bass there either; the four bars the retranscription has before the loud part (124–127) are not in the recording.
- The two uploads of the album version, "Overdrive Arcade" (`ENZaFo2cEog`, Songsterr's default) and "Motorpsycho - Topic" (`ENCBJU-xHcA`), carry the same audio. The Topic upload runs 349 ms ahead, with no drift.
- The MP3 that arrived with the retranscription is rendered at 110 BPM: it belongs to the 243-bar score, not to the retranscription (107 BPM).
- Of the 31 Songsterr tabs in the library, three are AI-generated: Vortex Surfer, The Wheel and wearing yr smell. The other two have not been measured.

## Decision

**Copies.** A song may be in the library more than once. Each copy is a song of its own: a slug, a folder, a sidecar, chunks and progress. Its title is the song's title with what sets it apart in brackets, and its `notes` say what the copy is and name the others. Copies are for comparing; the owner removes those that are not kept.

| Slug | Score | Bass |
|---|---|---|
| `vortex-surfer` | Songsterr AI tab of 2025-10-13, 243 bars | from bar 130 (the acceptance fixture, unchanged) |
| `vortex-surfer-from-the-start` | the same score with notes added | from bar 16: the lowest voice, one whole note per bar, then the same tab |
| `vortex-surfer-retranscribed` | Songsterr AI retranscription of 2026-09-29, 236 bars, eight tracks | from bar 124; synced lyrics from its vocal track |

**Sync measured in the recording.** When Songsterr's points are off for a song, or a file has none, `media.youtube.sync` holds the bar starts measured in the recording. The song's `notes` say so, and `fetch-video --write` must not be run for it. `media.youtube.songsterr` stays when the tab and the video are Songsterr's; it no longer says where the anchors came from.

How the three copies were measured (one-off scripts with numpy and scipy, not in the repository):

1. Onset strength of the recording (spectral flux, 2.5 ms steps).
2. An eighth-note grid through the whole recording by dynamic programming (Ellis 2007), with the local tempo taken from Songsterr's points. 1946 eighths; within 20 ms of Songsterr's own eighths where those are steady.
3. The root of every eighth: the strongest spectral peak in 39.5–77.5 Hz (bass fundamentals) and in 79–135 Hz. Every change of root, from the first guitar note to the last chord, falls on the same eighth of eight. So the recording is in 4/4 throughout and bar *k* starts at eighth 8*k* − 11.
4. The anchors are that grid, smoothed over nine eighths (4 ms rms of jitter removed). Bar 1 starts before the video does, so its anchor is 0:00 and the bar is shortened.
5. For the retranscription, beat *b* of the score is eighth 2*b* + 1. Its 2/4 bars make up for bar lines that are half a bar off before bar 63.

Checks:

| What | Result |
|---|---|
| Time of the bass's pitch changes against the tab, with Songsterr's points | 0.55 s late (bars 130–176), 0.27 s late (bars 192–234) |
| The same with the measured anchors, 44 changes | median 29 ms early, half of them between 64 ms early and 0 (the check smears a change over about 50 ms) |
| The onset detector on synthetic notes with known onsets | 0 ms, within 3 ms |
| The retranscription's guitar chord changes in bars 15–52 | every one on its eighth of the grid |
| The roots written into bars 16–129 against the recording | all 114 bars agree |

**The recording used for measuring.** ADR-0011 stays: no recording is stored or re-hosted. To measure, the audio of the two videos was fetched once into a temporary folder outside the repository, with the owner's permission (2026-10-11), and deleted afterwards. Only bar times and note names derived from it are in the repository, as Songsterr's points are (ADR-0028). Each such fetch needs the owner's permission again.

**A derived score.** `songs/vortex-surfer-from-the-start/score.gp` is not a Songsterr export. It is `songs/vortex-surfer/score.gp` with one whole note added to the bass track in each of bars 16–129, written out with alphaTab's `Gp7Exporter`. The rule that an exported `score.gp` is never edited stays; a derived score is a new file in its own folder, and its `notes` list what was added and from what. The added notes are an arrangement, not a transcription of a bass: the guitar's lowest notes at the pitch they sound.

**The MP3.** The inbox MP3 is attached to `vortex-surfer` as its Music source (offset 3 ms). The copies have none.

## Consequences

- Vortex Surfer's tab is on the video to within a few tens of milliseconds by measurement. The owner has not yet checked it by ear.
- The library has three cards for the song. The e2e tests pick the card without brackets, and the "no MP3" test uses `vortex-surfer-from-the-start`.
- Nothing in the code stops `fetch-video --write` from replacing measured anchors with Songsterr's points. The warning is in `notes` only.
- The measuring scripts are not in the repository, and they need the recording. If more songs need them (The Wheel and wearing yr smell are the candidates), they could become tools under `scripts/`.
- The derived score cannot be rebuilt from the repository alone. Its notes are simple enough to describe in full in `notes`; changing them (an octave lower, another rhythm) means writing the file again.
- The bar times are specific to the Overdrive Arcade upload. For the Topic upload, subtract 349 ms from every anchor.

## Alternatives considered

- **Shift Songsterr's points** by 555 ms up to the break and 277 ms after it. Two constants found by hand, and the place of the slip would be a guess. The measured grid also drops the points' jitter of up to 30 ms.
- **The tap editor (ADR-0016).** Not built, and tapping 243 bars is less exact than the onsets.
- **The Topic upload instead.** The same audio; nothing is gained.
- **Add the early notes to `vortex-surfer` itself.** It is the acceptance fixture (tacet 1–129, nine chunks), and the added notes are not a bass part of the recording. A copy keeps the two apart.
- **The early notes an octave lower**, where the bass plays the same roots from bar 144. Easier with open strings, but an octave below anything in the recording. Left as a choice for the owner.
