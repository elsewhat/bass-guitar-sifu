# ADR-0032: Practice videos recorded from the app

Status: Accepted for what is recorded and how the app is driven; the capture is superseded by ADR-0035 (from the screen, the default on Windows) and ADR-0033 (OBS). The capture below is kept as `--engine chrome`.
Date: 2026-11-08

## Context

- The owner wants a video of the practice view playing a whole song with its YouTube video (owner, 2026-11-08):
  - from bar 1, every bar once, with no repeats;
  - the video's sound;
  - the screen's full resolution;
  - an MP4 for an unlisted YouTube upload, for the owner's own training.
- ADR-0011 says recordings are never downloaded or re-hosted. A video of the app with the YouTube player in it holds the recording's picture and sound, so this ADR amends ADR-0011.
- The app has no recording of its own, and the machine has no ffmpeg.
- Tried on the owner's machine (Windows 11, Chrome 156, 1920 × 1080 at 100 %, RTX 2080 Ti):
  - Chrome can record its own tab, sound included, with `getDisplayMedia({ preferCurrentTab: true })`. The `--auto-accept-this-tab-capture` switch accepts it without a dialog.
  - `MediaRecorder` writes MP4 with H.264 and AAC.
  - **The visible window does not work.** While a tab is captured, Chrome shows its "sharing this tab" bar above the page, also in full screen. The page then measures 1920 × 1024, not 1080.
  - **Headless Chrome works.** It has no bar and keeps the page at the size it is given. It renders on the GPU (ANGLE on Direct3D 11) and captures the tab's sound in stereo.
  - The tab's sound is captured mono, with echo cancelling, noise suppression and gain control, unless the constraints switch these off.

## Decision

`npm run record-video -- <slug | app URL>` (`scripts/record-video.ts`) records a song as it plays in the app. Options:

- `--out <file.mp4>`, or `--dir <folder>` for the default name in another folder;
- `--skip-existing`: do nothing when that file is already there, so a batch over every song can be run again;
- `--base <url>`: the app; the live site by default, or a local `npm run preview`;
- `--size <W>x<H>`;
- `--fps <n>`: 60 by default;
- `--seconds <n>`: a short test;
- `--listen`: also play the sound on this computer.

**The browser.** The installed Chrome, headless, through Playwright (already a dev dependency).

- The page is the primary screen's resolution in pixels (on Windows from `Win32_VideoController`; elsewhere 1920 × 1080 unless `--size` is given), at device scale 1. The stage scales to fit as on the screen.
- Playwright's `--mute-audio` is removed, since the tab's sound is what is recorded.
- Nothing is shown or heard while it records, unless `--listen` is given.

**The app's state.**

- A fresh profile, so the song starts at bar 1 (ADR-0031).
- `bass-trainer:v1:settings` is set before the app loads:
  - play through (ADR-0021), so every chunk and rest plays once;
  - master and YouTube at 100 %;
  - the metronome's Click and Voice muted, so the count-in (ADR-0025) is seen but not heard.
- Lyrics follow the default, which is on: synced lyrics show as subtitles over the video.

**The run.**

1. The script chooses YouTube and waits for the notation and the player.
2. It records 1 s of the song standing at bar 1, then presses Space, the Play shortcut.
3. It records until the session stops playing, which in play through is the end of the song, plus 2 s.
4. Nothing is hovered or focused, so no tooltip or focus ring is recorded.
5. It stops early on `--seconds`, on Ctrl+C (the recording so far is kept), on a YouTube error (its message is logged), or when the end is missed: after 1.5 × the last bar's start on the video, plus 2 minutes.
6. A recording cut short by a YouTube error, a missed end or a failure is saved as `<name> (incomplete).mp4` and exits with 1. `--skip-existing` looks only for the full name, so a batch run again records the song again.

**The capture.**

- The page records its own tab with `getDisplayMedia`. Video is at the page size and up to `--fps`. Sound is stereo, with echo cancelling, noise suppression and gain control off, and local playback suppressed unless `--listen` is given.
- `MediaRecorder` writes MP4: H.264 High profile, at level 4.0, 4.2, 5.1 or 5.2 by size and frame rate, and AAC.
  - Video bit rate: 0.1 bit per pixel and frame, which is 12.4 Mbit/s at 1080p60, close to YouTube's recommendation for 1080p60.
  - Audio: 256 kbit/s is asked for; Chrome gives about 190.
- One chunk a second is passed to Node through a Playwright binding and appended to `<out>.part`.
- **Segments.** Chrome's MP4 recorder crashes the tab just below 4 GiB of output (2026-11-08: five songs of 10–29 minutes in 4K, each at 4.09–4.10 GiB). After 3 GiB a new `MediaRecorder` on the same stream takes over at once, into `<out>.part2`, and so on. `RECORD_SEGMENT_MB` sets a smaller size, to test the join.

**The file.**

- Chrome's MP4 is fragmented: an empty `moov`, then `moof` + `mdat` pairs, and a length of 0 in the header. Windows shows no length for it.
- `defragmentMp4` (`scripts/lib/mp4.ts`) rewrites it as an ordinary MP4 and copies the media unchanged:
  - one `moov` in front, with full sample tables;
  - one `mdat`;
  - a gap between fragments goes to the sample before it, so the sound and picture keep their times;
  - a track that starts late gets an empty edit;
  - a cut-off file keeps the samples it has;
  - segments are joined into one file. Each starts at its own time 0 with a key frame, so the next one begins where the longest track of the one before ends, and the sound stays with the picture. A new recorder may number its tracks the other way round, so tracks are matched by their sample description and timescale, which must be the same.
- If the rewrite fails, Chrome's file is kept as it is (one file per segment, `(part N)`), and YouTube also takes that.
- The file goes outside the repository: `Videos/bass-guitar-sifu/<Artist> - <Title>.mp4` in the home folder. If that name is taken, ` (2)`, ` (3)` and so on is added. YouTube takes the file name as the default title.

**ADR-0011 amended.** The owner may record the app playing a song with its YouTube video, for the owner's own use. The recordings are made and kept outside the repository and are never committed or published from it.

## Consequences

- A recording takes as long as the song, plus about 10 s to load. The computer stays free meanwhile.
- The video shows the app as deployed. Use `--base` for a local build.
- Frames come when the page changes, about 60 a second while the strip scrolls; the still second before Play is one frame. YouTube takes the variable frame rate.
- 4K (`--size 3840x2160`, 2026-11-08): the page is rendered at 4K although the screen is 1080p. While playing it holds about 55 fps (median frame 16.7 ms, a few dropped frames) at about 60 Mbit/s, roughly 450 MB a minute.
- Size: Chrome's encoder overshoots the asked 12.4 Mbit/s and gives about 20, which is about 150 MB a minute at 1080p60. Vortex Surfer (live) took 1.2 GB for 8:06.
- YouTube's own overlays are recorded:
  - the thumbnail with its play button, before Play;
  - the title and "More videos" for a moment after the start;
  - the "More videos" shelf at the end.
- An upload with the recording's sound is likely to get a Content ID claim, also when unlisted. That is between the owner and YouTube.
- At a join the old recorder stops as the new one starts. A test with 4 segments (Creep, 25 s, 15 MB segments) had no gap in the picture and at most 16 ms in the sound.
- Tests: `scripts/mp4.test.ts` covers the rewrite and the join with hand-built fragmented files. The browser part needs YouTube and a real Chrome, so it has no automated test. It was checked by recording `vortex-surfer-live` at 1080p: 8:03 played, an 8:06 file, picture and sound the same length.
- At 4K this capture stalls every 1.8 s: headless Chrome has a hardware encoder only up to 1080p (ADR-0033). Use it at 1080p, or on a machine without OBS and ffmpeg.

## Alternatives

- **A screen recorder.** Set aside at first because it holds the screen for the whole song; adopted later, when 4K needed it (ADR-0035).
- **Chrome's screencast** (`Page.startScreencast`): JPEG frames, no sound.
- **The visible Chrome window in full screen.** The sharing bar takes 56 px from the page, and the computer cannot be used meanwhile.
- **ffmpeg for the rewrite** (`-c copy -movflags +faststart`). That would mean a binary download for one step on every machine and in CI. The rewrite is short and tested.
- **WebM.** YouTube takes it, but Chrome's WebM also has no length in its header, and the owner asked for MP4.
