# ADR-0022: Music source, audio rendered from the transcription

Status: Proposed (implemented, awaiting owner review)
Date: 2026-09-29
Amends: ADR-0008 and ADR-0016 (a fourth source), ADR-0011 and ADR-0012 (rendered audio in the repository), ADR-0013 (`media.music`), ADR-0015 (the skill takes the MP3), ADR-0020 (Music channel).

## Context

- The owner added an MP3 next to every `.gp` in `music/`. The MP3s are rendered from the same source as the transcription, so the whole band plays the transcribed parts, and the audio follows the score's tempo map.
- This gives a full-band backing with no sync map (ADR-0016's tap editor is only needed for YouTube). It is a better play-along than the Synth, whose alphaTab sounds are thin, and it works for every song, whether or not an official video exists.
- The renders start with a short lead-in and end with a tail: they are 3–7 s longer than the scores. The lead-in is not in the files' metadata.
- The owner wants Music at 100 % only, with chunk looping. Slowing down stays with Synth and Metronome.
- Sizes: 2.7–18 MB per song (The Wheel is 19 minutes). Decoded to PCM, the longest would take about 400 MB.

## Decision

- **Storage.** The MP3 is moved with the `.gp` to `songs/<slug>/audio.mp3`. The Vite plugin `scripts/vite-song-scores.ts` serves it as `<base>data/audio/<slug>.mp3` in dev, with byte ranges so `<audio>` can seek, and copies it into the build in `writeBundle`. There is no copy in `public/`.
- **Sidecar.** `media.music: { source, offsetMs }` in `song.yaml` (ADR-0013). `source` is the inbox file name. `offsetMs` is the audio time of the score's first tick. The build emits `media.music: { url, offsetMs }` into the song JSON and `music: true` into the catalogue. The build fails when `media.music` is set without `audio.mp3`, and warns about an `audio.mp3` without `media.music`.
- **Offset measurement.** `npm run inspect-song -- <slug> --audio songs/<slug>/audio.mp3`:
  - decodes the MP3 in slices (`mpg123-decoder`, a dev dependency) into an onset envelope: the rise in log energy per 10 ms;
  - cross-correlates it with the onsets of every track in the score (`scripts/lib/audio-align.ts`);
  - aligns the first and the last minute separately, and warns when they differ by more than 30 ms (drift: the audio does not follow the tempo map) or when the match is weak.
  The skill writes the first-minute offset. It is measured once and frozen, never guessed at runtime.
- **Clock.** `MusicClock` (`src/playback/music-clock.ts`) implements `PlaybackClock` (ADR-0018) over a `MusicPlayer` port, modelled on `SynthClock` (ADR-0019):
  - audio time = `secondsAt(tick) + offsetMs / 1000`, and `TempoLookup.tickAt` is the inverse;
  - the position is extrapolated per frame and corrected 20 % toward each new `currentTime`;
  - a 10 ms timer asks `onRangeEnd` 0.25 s before the range end and seeks to the next range's start when the end is heard;
  - a chunk that continues right after the current one needs no seek, so play-through has no gap.
- **Player.** `src/playback/music-player.ts` streams the file through `<audio>` (not decoded up front) and routes it through Web Audio (`MediaElementAudioSourceNode` → gain → destination). This lets the mixer set master × music, and removes the output latency from the reported time.
- **Full speed only.** `capabilities.rates` is `[1]` and `setRate` does nothing.
  - While Music is the source, the tempo control is locked: the buttons are disabled and it shows 100 % and the score BPM.
  - The chosen tempo is kept and comes back on the other sources. This is the design's Spotify pattern (`Main.dc.html`, `tempoLocked`, `eff()`).
  - Passes completed on Music are recorded at 100 %.
- **UI.** The source switch reads `YouTube · Synth · Music · Metronome`.
  - Music is disabled for songs without `media.music`. Loading such a song while Music is chosen falls back to Metronome.
  - The video cell shows "Music playback" with "Loading audio… NN %" or "Rendered from the score · full speed only".
- **Mixer (ADR-0020).** New global channel `music` (default 100 %, stored with the other global channels). The Music tab has one row, since the render is a single stereo mix.
- **Content (amends ADR-0011 and ADR-0012).** Audio rendered from the transcription has the same status as the `.gp` it comes from, and is published with it. Commercial recordings are still never downloaded or stored; YouTube stays an embed.

## Consequences

- Every new song gets a full-band play-along at the real tempo on day one, with no sync work.
- The repository grows by about 100 MB with the current songs, and each MP3 is publicly readable on Pages. As with the `.gp` files, the owner accepts that a file may have to be removed after a takedown request. `.gitattributes` marks `*.mp3` as binary.
- Loop wraps are accurate to tens of milliseconds (an `<audio>` seek), not to the sample as with Count. That is enough for looping a chunk. Count stays the reference for exact timing.
- The bass is part of the render and cannot be muted separately. For play-along without the recorded bass, the Synth's Backing quick mix remains.
- Songs whose score has repeat signs (Freedom) are still blocked by the importer; their audio would follow the repeats.

## Alternatives considered

- **Decode the whole MP3 with `decodeAudioData` and loop an `AudioBufferSourceNode`.** Sample-accurate loops, but hundreds of MB of PCM for the long Motorpsycho songs. It could be used per chunk later if the `<audio>` wraps turn out to be too rough.
- **Time-stretch Music to 40–100 %** (`preservesPitch` on `<audio>`). The owner chose full speed only; slow practice is what Synth and Metronome are for.
- **Detect the offset at runtime.** This would repeat work on every load, can fail silently, and cannot be reviewed in the diff.
