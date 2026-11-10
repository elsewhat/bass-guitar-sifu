# ADR-0033: Practice videos recorded with OBS

Status: Proposed (implemented, awaiting owner review)
Date: 2026-11-09

Amends ADR-0032: OBS records the videos by default; Chrome's own recorder stays as `--engine chrome`.

## Context

- The owner found that the 4K videos from ADR-0032 hold a few frames still every few seconds (owner, 2026-11-09, `Go with the Flow`).
- Measured in the file (`Go with the Flow`, 4K60, 3:08):
  - every 1.8 s, about 0.25 s after each key frame, 100–250 ms of frames are missing: 87 times in the song;
  - the frame times are in the file itself, so neither the drive (E:) nor the player causes it.
- The cause is Chrome's encoder:
  - headless Chrome has a hardware encoder (the RTX 2080 Ti's) only up to 1080p, for every codec (`VideoEncoder.isConfigSupported`, Chrome 156);
  - at 4K it encodes H.264 on the CPU, in real time; after each key frame (every 100 frames) it falls behind and drops frames;
  - 30 s at 1080p lose at most one frame per key frame; at 4K, 6–15.
- What did not fix it in Chrome:
  - a key frame every 10 s: one 2 s freeze instead;
  - 30 fps: frames alternate between 17 and 50 ms, so the scroll judders;
  - other bit rates: the output does not follow the asked rate. 0.25, 0.27, 0.42 and 0.5 bit per pixel gave 59–71 Mbit/s and stalled. 0.29–0.36 gave 5–26 Mbit/s and lost at most 3 frames at a time. That works for Go with the Flow at 0.3, but nobody can say why, so it is not relied on.
- OBS Studio 33 is installed (owner, 2026-11-09). Measured:
  - its NVENC encoder does H.264 up to 4096 × 4096 on the GPU;
  - its browser source is Chromium 150 (CEF) and renders a page off screen at any size, its sound routed into OBS;
  - started with `--remote-debugging-port`, its browser answers the Chrome DevTools Protocol, so Playwright can drive the page in a browser source like any other.

## Decision

`npm run record-video` records with OBS by default (`--engine obs`). The page is driven exactly as in ADR-0032: the same settings, YouTube chosen, Space pressed, the same end, lead-in, tail, `--seconds`, Ctrl+C and `(incomplete)` naming.

**OBS.**

- When OBS is not running, the script starts it minimised to the tray with `--remote-debugging-port=9223` (`OBS_DEBUG_PORT`) and `--disable-shutdown-check`. Its WebSocket server is switched on in OBS's config if it is off. OBS keeps running afterwards, ready for the next song.
- If OBS is running without that port, the script asks for OBS to be closed. If its WebSocket server does not answer, it says where to switch it on.
- `scripts/lib/obs.ts` is a minimal obs-websocket 5 client. The password is read from OBS's own config.
- The recorder uses its own profile and scene collection, both called `bass-guitar-sifu`, so the owner's own OBS setup is untouched. Switching is asynchronous, so the script waits until OBS reports the new one as current before it changes anything. On each run it sets:
  - the canvas and output to the recording's size and frame rate;
  - advanced output: a hybrid MP4, AAC 320 kbit/s on track 1, 48 kHz stereo;
  - the video encoder in the profile's `recordEncoder.json`: NVENC H.264, constant quality CQP 20, preset P4 with high-quality tuning, one pass, no look-ahead, a key frame every 2 s, 2 B-frames. OBS reads this file, and the output mode, only when it loads a profile, so the script loads the profile again by way of another one;
  - the record folder: the output file's folder; the file is renamed when OBS has finished it;
  - one scene, `Song`, with one browser source, `App`, at the recording's size and frame rate, its sound routed into OBS, filling the canvas;
  - every other sound source muted: desktop sound and microphones are not recorded. `--listen` turns on monitoring for the browser source.
- The browser source starts on a blank page with a known title, at a URL that is new each run: Playwright navigates the page, not OBS, so OBS would not reload a URL it already has. Playwright connects over CDP, finds that page, clears the app's site data (a fresh start at bar 1, ADR-0031), adds the settings script and opens the app.
- OBS's `GetStats` gives the frames rendered, missed and skipped while recording; the script logs them.
- If OBS cannot start the recording, it shows a dialog and logs nothing more; the script stops and points to that dialog and OBS's log.
- Afterwards the page goes back to blank, so nothing plays on in OBS.

**The file.** OBS's hybrid MP4 is an ordinary MP4 when finished (`ftyp`, `mdat`, `moov`), with a constant 60 fps and no size limit. No rewrite or join is needed.

**Chrome stays** as `--engine chrome` for a machine without OBS. It is fine at 1080p, where the GPU encodes.

## Consequences

- Go with the Flow, the whole song in 4K60 (2026-11-09, `C:\temp\Queens of the Stone Age - Go with the Flow (OBS).mp4`):
  - 11 316 frames rendered, none missed by the renderer or skipped by the encoder (OBS's stats and log);
  - 3:08 at a constant 60 fps, with picture and sound the same length (188.25 s);
  - no repeated frames while the song plays: the only near-empty frames are in the 3 s after it stops, where the picture stands still;
  - 304 MB, about 13 Mbit/s, against 1.7 GB from Chrome. A frame at full size is as sharp as Chrome's;
  - the sound: silent in the lead-in, then the full 320 kbit/s from Play on.
- Things found on the way:
  - NVENC at preset P5 with two passes (quarter resolution) and look-ahead kept up for 20 s but not for a whole song: 61 % of frames skipped for encoding lag and 3.3 % lagged in rendering. P4 in one pass without look-ahead has none.
  - OBS's simple output mode with NVENC at a quality preset failed to start ("Starting the output failed", with nothing in the log). Advanced mode with `recordEncoder.json` works.
  - Profile settings sent right after `CreateProfile` landed in the profile OBS was leaving (`Untitled`); they were put back, and the script now waits for the switch.
- The recording needs OBS running in the background, and the GPU's encoder. The computer stays free meanwhile.
- OBS's browser keeps its own cookies and site data. The app's data is cleared before each song; YouTube's is kept.
- The remote debugging port answers only on this computer (127.0.0.1), while OBS runs with it.
- All 58 songs were recorded again this way (2026-11-09/10, 21.3 GB in `E:\sifu-videos`): every one with 0 frames missed or skipped and no stalls in the file. The Chrome recordings are in `E:\sifu-videos\chrome\` until the owner deletes them.
- Once, for 6 minutes, OBS did not load the browser source's new URL, and 9 songs in a row stopped before recording. OBS's log says nothing about it. The script now gives the source another fresh URL, then hides and shows it so OBS makes a new browser, before it gives up.

## Alternatives

- **Chrome at 0.3 bit per pixel.** No stalls in Go with the Flow, but the encoder's behaviour across bit rates is unexplained and may differ per song or Chrome version.
- **Our own WebCodecs pipeline in Chrome** (frames queued for a software encoder instead of dropped, then our own MP4 muxer). Still the CPU at 4K60, and a muxer to write and test.
- **OBS driven by the app itself** (`window.obsstudio` and a `?record` option in the app). Needs app changes; Playwright over CDP needs none.
- **OBS capturing a visible window or the screen.** The screen is 1080p, and the computer could not be used meanwhile.
