# ADR-0030: Bass parts transcribed from the recording by analysis

Status: Proposed (implemented, awaiting owner review)
Date: 2026-10-12
Amends: ADR-0015 (a song without an inbox file), ADR-0013 (`source`), ADR-0011 and ADR-0029 (recordings fetched for measuring; the measuring scripts are now in the repository).

## Context

- The owner asked (2026-10-12) for the rest of Roadwork Vol. 1 (Motorpsycho, live in Europe 1998) as songs, without Words of Wisdom. The owner expected that no bass tabs exist and asked for more analysis of the recordings.
- **No tab exists.** Songsterr, Ultimate Guitar and the chord sites have nothing for The Other Fool, Superstooge, You Lied, a K9 Suite or Motorpsycho's Black to Comm. The library's The Wheel and Un Chien d'Espace are other takes: another key, another length.
- The album is a trio with a heavily distorted bass, played live: the tempo moves, the band adds and drops beats at the turns, and long parts are improvised.
- ADR-0029 left one-off scripts that track a beat grid in a recording and read the root of each bar. They are not enough for a bass part.

What building the tools showed:

- **Demucs does not isolate this bass.** Its `htdemucs` model removes drums and vocals well, but it files the distorted bass under "other" for long stretches. The bass stem of The Other Other Fool is nearly empty. So the lowest voice is read from the bass and "other" stems together.
- **Semitones.** With a 109 ms window the spectrum near a partial is smeared over several semitones below 100 Hz. The place of the spectral peak tells the semitone; the height does not.
- **Octaves.** Measured on Black to Comm and You Lied: under a note that really is at its octave, the spectrum an octave lower has less than a tenth of the fundamental's strength (90 % of the slots). Readings that turn out an octave too high have 0.2 to 0.3. The rule uses 0.12.
- **The grid.** Tracking the quarter-note pulse and halving it loses or gains an eighth note where the tracker flips to the off-beat. Tracking the eighth notes themselves avoids that. It does not work for sixteenth notes at 334 a minute (You Lied): there the tracker drifts.
- **Below the low E.** Super/Wheel has a D and the K9 Suite a C an octave below the bass's lowest string, probably bass pedals.
- **A check that came for free.** Vortex Surfer (Live) has the studio take's chord order from its first bar to its last. The roots were read without using the studio tab. The live take also has nothing below 80 Hz before the loud part.

## Decision

**Transcribed songs.** A song's `score.gp` may be written from an analysis of the recording when no tab exists. Such a song says so in three places:

- `source.file` is `Transcribed from the recording (ADR-0030)`, with the date of the analysis;
- the bass track is named `Electric Bass (transcribed)`;
- `notes` open with it, name the recording and the method, and end with what to check by ear.

The six songs: `the-other-other-fool`, `a-k9-suite`, `super-wheel`, `you-lied`, `black-to-comm`, and `vortex-surfer-live` as one more copy of Vortex Surfer (ADR-0029).

**The pipeline.** The scripts are in `scripts/transcribe/` (Python with numpy, scipy, PyTorch and Demucs, and two TypeScript files that use alphaTab). They are not part of the app, the song build or CI. `scripts/transcribe/README.md` has the commands.

1. `sep.py`: Demucs stems (drums, bass, other, vocals).
2. `grid.py`: the pulse grid. Onset strength mainly from the drum stem, the tempo by autocorrelation with a Viterbi pass, the pulses by dynamic programming (as in ADR-0029, now without Songsterr's points).
3. `drumenv.py` and `pitch.py`: kick and snare strength; the pitch of the lowest voice per 10 ms. Each semitone's harmonic sum counts a partial by how near the spectral peak lies, and only where the fundamental itself is a peak.
4. `slotfeat.py`: the same per grid slot (an eighth note, or a sixteenth for You Lied).
5. **The analyst's decisions**, one file per song in `scripts/transcribe/songs/`: where bar 1 starts, bars of another length, the lowest note, parts written as one note per bar, parts left empty, and the string for a pitch where the easiest one is not how the part is played (`place`, added 2026-10-13). The tools for it print the grid bar by bar (`bars.py`, `roots.py`), fold a riff over its cycle with the drum pattern (`sfold.py`, `period.py`), and propose odd bars where repeated material slips against the bar lines (`align.py`).
6. `transcribe.py`: the notes.
   - Bars that sound alike vote together on every slot.
   - The octave rule above.
   - A loud slot without a clear pitch is a drum hit over a note; it takes the pitch that fits it better, the note before or the note after.
   - One-slot misreadings are folded into their neighbour, but only where the similar bars do not agree on the slot.
   - Bars that agree in most slots are made equal where the bar's own sound allows it.
   - String and fret: the path with the least hand movement, except for the pitches the song's file places.
7. `write-score.ts` writes the Guitar Pro file with alphaTab, `chunks.py` drafts the chunks by the skill's rules, `write-sync.ts` puts the anchors into `song.yaml`.

**The skill.** Section 10 of the `preprocess-song` skill says when to transcribe, what to ask the owner, which decisions make or break the result, and what `song.yaml` and the summary must say.

**Sync.** The anchors are the bar starts of the same grid (ADR-0029). A bar with an odd number of sixteenth slots is written one slot shorter or longer and gets a second anchor on its last note. `fetch-video --write` must not be run for these songs.

**Tuning and range.** Standard tuning is assumed. Notes below the low E are written an octave up.

**The recordings.** As in ADR-0029: fetched into a temporary folder with the owner's permission (2026-10-12, the six tracks of the album's YouTube playlist), deleted after the analysis. PyTorch and Demucs were installed into a temporary Python environment, also with permission; Demucs's weights come from Hugging Face. Only notes and bar times are in the repository.

Checks:

| What | Result |
|---|---|
| Vortex Surfer (Live), root of every bar from 117 to the end against the studio tab from its bar 130 | the same in 92 of 93 bars; in the other the studio tab rests |
| Vortex Surfer (Live), bars 2–115 against the roots written into `vortex-surfer-from-the-start` (ADR-0029) | the same in all 114 bars |
| Main riffs of You Lied, Black to Comm, The Other Other Fool, The Wheel across their repeats | one reading per riff after voting |
| The scripts in the repository, run on the saved slot features | the six scores, anchors and chunk lists again, byte for byte |
| Build, unit tests, Playwright | 39 songs, 228 tests, 19 tests; the six videos load in the app |
| By ear | not done |

## Consequences

- The library has six more songs (39). They are machine transcriptions and say so. Nobody has listened to them against the tab.
- What to expect:
  - Riffs that repeat come out the same each time. Small variations and fills are smoothed away.
  - Rhythm is quantised to eighth notes (sixteenths in You Lied). Held notes and struck notes are told apart by onset strength, which is the weakest part.
  - Improvised stretches are rough: the jam in Super/Wheel, the ending of You Lied, the long build of the K9 Suite, which is written as C in eighth notes.
  - The lowest voice is not always the bass. In The Other Other Fool nothing sounds below the open D string. In the first four minutes of Vortex Surfer (Live) it is the guitar, written as whole notes.
  - Some odd bars (7/8, 9/8, 2/4) follow the band; some may be the tracker's doing.
- A score cannot be rebuilt without the recording. The per-song decisions are in the repository; the features computed from the audio are not.
- The repository now has Python tools that no test covers and that need a GPU-sized install to run from the start.
- `a-k9-suite` is the largest song: 752 bars, 70 chunks, 759 kB of generated JSON (The Wheel has 685 kB).
- The library search test now types "the wheel", because "wheel" also finds Super/Wheel.

## Alternatives considered

- **Songsterr's AI transcription**, which made the Vortex Surfer tab. It needs the owner's account, and its bar points were wrong (ADR-0029). It can still be made later and compared.
- **The Demucs bass stem with a single-voice pitch tracker.** The first attempt. It fails where Demucs files the bass under "other".
- **A trained transcription model** (Basic Pitch and others). More to install, and no better at telling a distorted bass from a guitar.
- **Splitting the K9 Suite into songs.** It is one track and one video; the chunks cover its parts.
- **Leaving the first minutes of Vortex Surfer (Live) empty**, as in `vortex-surfer`. Whole notes can be ignored; a missing part cannot be practised.
