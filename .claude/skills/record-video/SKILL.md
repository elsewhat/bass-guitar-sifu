---
name: record-video
description: Record practice videos - an MP4 of the app playing a song with its YouTube video from bar 1, in 4K60, from the screen (ADR-0035). Use when the user wants to record, re-record or batch-record practice videos for one song, an artist's songs or the whole library, or runs /record-video [slug ...].
---

# record-video

Records `npm run record-video -- <slug>` for one song or a list of songs, checks each file, and records the failed ones again. The design is in ADR-0035 (the capture), ADR-0032 (what is recorded and how the app is driven) and ADR-0033 (how the script starts and talks to OBS).

**Input:** one or more slugs, an artist, or "all". Slugs are the folder names in `songs/`; the artist is in each `song.yaml`.

The videos hold the YouTube recording. They stay outside the repository (ADR-0011, ADR-0032). The owner's videos are in `E:\sifu-videos`.

## How it works

- Chrome plays the app in full screen. ffmpeg records that window with Windows Graphics Capture and NVENC, each frame with the time it was shown. OBS records Chrome's sound only.
- A beep and a white block after the song's end tell how the two line up. The script joins them into one MP4 that ends before the marker.
- It runs in real time: a song takes its own length plus about 20 s.

## Before you start

Check these, and tell the owner what is missing:

1. **The PC is unlocked** and stays so. On a locked PC the capture gets no frames; the script refuses to start. The screen and the speakers are taken for the length of each song.
2. **The screen is 3840 × 2160.** The recording has the screen's resolution. Check `Win32_VideoController`; the owner's monitor has an FHD mode (frame rate boost) that makes it 1920 × 1080.
3. **OBS Studio and ffmpeg are installed** (`winget install Gyan.FFmpeg`; a download needs the owner's permission). The script starts OBS itself.
4. **The app's version.** The script records the live site. For changes that are not deployed, run `npm run build` and `npm run preview`, and pass `--base <url>`.

## Record

One song:

```bash
npm run record-video -- <slug> --dir "E:\sifu-videos\new" --size 3840x2160 --display-off
```

- `--size 3840x2160` is a check: the script refuses a screen of another size.
- `--display-off` has Windows turn the display off while it records (the owner's screen is an OLED). Do not suggest the monitor's power button: it may take the display away from Windows.
- `--dir` is a folder for the new files, apart from the videos they replace. Nothing is replaced until it is checked.
- `--skip-existing` skips a song whose file is already in `--dir`.

A batch: write a PowerShell script in the scratchpad that runs the command for each slug with `--skip-existing`, appends the output to `record-log.txt` in `--dir`, and stops when `LogonUI` is running (the PC is locked). Order the songs shortest first. Run it in the background; it needs no polling. After the first song's `0:30` line, check that the log says `3840×2160`.

## Check each file

From the log, per song:

- `Recorded (the song ended)`: anything else in the brackets is a failure, and the file is named `(incomplete)`.
- `Picture: N frames in X s, M gaps longer than one frame`: expect about one gap per 40 s (9 to 35 per song so far). Many more means the capture was disturbed: record the song again.
- `Sound moved by … ms to meet the picture`: 290 to 360 ms so far.

With `ffprobe`: the picture is 3840 × 2160, and picture and sound are the same length to within 0.1 s.

## Failures seen

- **YouTube player error 5** at 0:43 to 0:45, about one recording in ten. Not explained. Record the song again.
- **An SSL or network error** before the recording starts. Record the song again.
- **1920 × 1080 files:** the monitor was in its FHD mode. The owner switches it back.

To record the failed songs, delete the `(incomplete)` files and run the same batch again: `--skip-existing` skips the good ones.

## Finish

1. Move the checked files over the old ones (same file names). The owner asked for this when asking for the recording; otherwise ask.
2. Report per song: length, size, gaps, and what was recorded again and why. Say that nobody has watched the files.
3. Do not commit, and put no video in the repository.
