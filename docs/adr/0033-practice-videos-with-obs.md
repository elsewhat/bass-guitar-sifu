# ADR-0033: Practice videos recorded with OBS

Status: Superseded as the default on Windows by ADR-0035; kept as `--engine obs`
Date: 2026-11-09

Amends ADR-0032. Amended by ADR-0035: the picture is recorded from the screen, and OBS records only the sound. This ADR still describes `--engine obs`, and how the script starts and talks to OBS, which the screen engine uses too.

## Context

- The 4K videos from ADR-0032 hold a few frames still every 1.8 s (owner, 2026-11-09). Headless Chrome has a hardware encoder only up to 1080p; at 4K it encodes on the CPU and drops 100–250 ms of frames after each key frame.
- OBS Studio 33 is installed. Its NVENC encoder does H.264 at 4K on the GPU, and its browser source renders a page off screen at any size with its sound routed into OBS.
- Started with `--remote-debugging-port`, OBS's browser answers the Chrome DevTools Protocol, so Playwright can drive a page in a browser source.

## Decision

`npm run record-video -- <slug> --engine obs` renders the app in an OBS browser source and records it with OBS. The page is driven as in ADR-0032.

**OBS.**

- When OBS is not running, the script starts it minimised to the tray with `--remote-debugging-port=9223` (`OBS_DEBUG_PORT`) and `--disable-shutdown-check`. Its WebSocket server is switched on in OBS's config if it is off. OBS keeps running afterwards.
- If OBS is running without that port, the script asks for OBS to be closed.
- `scripts/lib/obs.ts` is a minimal obs-websocket 5 client. The password is read from OBS's own config.
- The recorder uses its own profile and scene collection, both called `bass-guitar-sifu`, so the owner's OBS setup is untouched. Switching is asynchronous: the script waits until OBS reports the new one as current before it changes anything.
- OBS reads the encoder file (`recordEncoder.json`) and the output mode only when it loads a profile, so the script loads the profile again by way of another one.
- On each run it sets:
  - the canvas and output to the recording's size and frame rate;
  - advanced output: a hybrid MP4, AAC 320 kbit/s, 48 kHz stereo;
  - NVENC H.264, constant quality CQP 20, preset P4 with high-quality tuning, one pass, no look-ahead, a key frame every 2 s, 2 B-frames;
  - one scene, `Song`, with one browser source, `App`, at the recording's size, its sound routed into OBS;
  - every other sound source muted. `--listen` turns on monitoring for the browser source.
- The browser source starts on a blank page at a URL that is new each run. Playwright connects over CDP, finds that page, clears the app's site data, adds the settings script and opens the app.
- If OBS does not load the new URL, the script gives the source another one, then hides and shows it, before it gives up.

**The file.** OBS's hybrid MP4 is an ordinary MP4 with a constant 60 fps and no size limit.

## Consequences

- The computer stays free while it records, and the screen may be locked. That is what this engine is still good for.
- OBS's stats report 0 frames missed or skipped, and the files have no stalls: 304 MB for Go with the Flow against 1.7 GB from Chrome.
- **Repeated frames.** OBS shows some page frames twice and skips the next, so the strip moves 0 and 14 px instead of 7 and 7. OBS's stats do not show it.
  - Cause: OBS has not driven its browser's frames since November 2021 (`BROWSER_EXTERNAL_BEGIN_FRAME_ENABLED` is defined in no build of obs-browser). The browser draws on a timer of its own, and OBS samples its last frame without synchronisation.
  - At 60 fps the two clocks drift past each other every 7 minutes (16 666 µs against 16 666.67 µs). Half of the page frames reach OBS a frame early or late.
  - How many frames repeat is luck per recording and changes within a song: 0 to 20 %.
  - Nothing tried in OBS removed it: the source's custom frame rate, a drift-free frame rate (500000/8333 fps) with a search for a good clock offset, 120 fps, or a Window Capture of Chrome.
  - ADR-0035 records the picture from the screen instead.
- NVENC keeps up at 4K60 with preset P4 in one pass. P5 with two passes and look-ahead skipped 61 % of the frames over a whole song.
- OBS's simple output mode failed to start with NVENC; advanced mode with `recordEncoder.json` works.
- OBS's browser keeps its own cookies and site data. The app's data is cleared before each song; YouTube's is kept.
- The remote debugging port answers only on this computer (127.0.0.1).

## Alternatives

- **Our own WebCodecs pipeline in Chrome** with our own MP4 muxer. Still the CPU at 4K60.
- **OBS driven by the app itself** (`window.obsstudio`). Needs app changes; Playwright over CDP needs none.
- **Building obs-browser with `BROWSER_EXTERNAL_BEGIN_FRAME_ENABLED`.** Not tried: a C++ build of OBS's plugin, and it may not work with CEF 150.
