# Transcribing a bass part from a recording

Tools behind ADR-0030 (and the measured sync of ADR-0029). They are not part of the app, the song build or CI. A transcription made with them is a machine reading with an analyst's decisions on top: it must say so in the song's `notes`.

**Before you start.** Fetching a recording needs the owner's permission each time, and the audio must never be put in the repository (ADR-0011, ADR-0029). Work in a temporary folder outside the repository and delete the audio and the stems when you are done.

## What you need

- Python 3 with `numpy`, `scipy`, `torch` and `demucs` (a GPU makes `sep.py` take minutes instead of hours), and `yt-dlp` and `imageio-ffmpeg` to fetch and decode. On the owner's machine these were installed into a temporary virtual environment.
- Node with the repository's packages, for the two `.ts` files.

What was run on the owner's machine (Windows, RTX 2080 Ti), in a temporary folder:

```bash
python -m venv venv
venv/Scripts/python -m pip install numpy scipy yt-dlp imageio-ffmpeg
venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu126
venv/Scripts/python -m pip install demucs
```

```bash
venv/Scripts/yt-dlp -f "bestaudio[ext=m4a]/bestaudio" -o "%(id)s.%(ext)s" -- <videoId>
```

```bash
"$(venv/Scripts/python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")" -i <videoId>.m4a -ar 44100 -ac 2 -c:a pcm_s16le <dir>/mix.wav
```

Sizes and times to expect: about 1 MB of audio per minute, PyTorch with CUDA about 4.5 GB installed, Demucs's weights 81 MB (kept in `.cache/huggingface` under the user folder), and about 40 seconds of separation per five minutes of music on that GPU.

## Steps

`<dir>` is a work folder for one recording. Run the Python scripts from this folder or give their path; they find `rwlib.py` next to themselves.

1. Put the recording in `<dir>/mix.wav` (44.1 kHz stereo).
2. `python sep.py <dir>`: Demucs stems as `drums.wav`, `bass.wav`, `other.wav`, `vocals.wav`.
3. `python tempo.py <dir>/mix.wav 20`: the tempo over time, to choose the range for the grid.
4. `python grid.py <dir> <bpm_lo> <bpm_hi>`: the pulse grid, `beats.json`. Track the eighth notes themselves where the tempo allows it (a range around twice the tempo). The table it prints shows how much stronger the pulses are than the places between them.
5. `python drumenv.py <dir>` and `python pitch.py <dir> 23`: kick and snare strength, and the pitch of the lowest voice.
6. `python slotfeat.py <dir> <div>`: features per grid slot; `div` is slots per pulse (1 when the pulses are the slots).
7. Look, and write the song's file in `songs/<slug>.json` (the format is at the top of `transcribe.py`; the six files there are examples, and their `grid` entry records what was used in steps 4 and 6):
   - `python bars.py <dir> <first slot> <slots per bar> [from_s] [to_s] [group]`: the readings bar by bar with kick and snare.
   - `python roots.py <dir> <first slot> <slots per bar> 8 28`: the main pitch of every bar, eight bars a line.
   - `python sfold.py <dir> <first slot> <cycle> <from_s> <to_s>` and `python period.py <dir> <from_s> <to_s>`: a riff folded over its cycle, and after how many slots it repeats.
   - `python octave.py <dir>`: how often a note has a real peak an octave below it.
   - `python align.py <dir> <first slot> <slots per bar> [penalty] [max shift] [end slot] [pickup slots]`: proposes the bars of another length.
8. `python transcribe.py <dir> songs/<slug>.json [from_bar to_bar]`: writes `notes.json` and `anchors.json`, and prints the bars asked for.
9. `npx tsx scripts/transcribe/write-score.ts <dir>/notes.json songs/<slug>/score.gp`.
10. `python chunks.py <dir> songs/<slug>.json`: drafts `chunks.yaml` for `song.yaml`.
11. Write `songs/<slug>/song.yaml` (`source.file: "Transcribed from the recording (ADR-0030)"`), then `npx tsx scripts/transcribe/write-sync.ts songs/<slug>/song.yaml <dir>/anchors.json <videoId>` and `npm run build:songs`.

Steps 8 to 10 need only the files written in steps 4 to 6, not the audio.

## What the transcriber does and does not do

- It reads the **lowest voice** of the bass and "other" stems together, because Demucs files a distorted bass under either. Where the bass rests it reads the guitar.
- Bars that sound alike vote together. Riffs come out the same each time; fills are smoothed away.
- It writes one voice, on the slot grid, in standard notation values. No slides, ghost notes or dead notes.
- Octaves: a note is written an octave lower when that octave's fundamental is in the sound (more than 0.12 of the note's own). Notes below `lowest` are folded up.
- Strings: it takes the path with the least hand movement, which likes open strings. Where the part is played elsewhere, say so with `place` (a pitch on a string and fret, for a range of bars).
- It cannot hear. Every result needs a listen.
