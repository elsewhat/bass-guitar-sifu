# ADR-0035: Practice videos recorded from the screen

Status: Accepted (owner, 2026-11-12)
Date: 2026-11-11

Amends ADR-0032 and ADR-0033: `--engine screen` is how practice videos are recorded on Windows. The skill `.claude/skills/record-video/SKILL.md` has the steps for recording a song or a batch.

## Context

- The owner wants 4K60 practice videos in which the strip scrolls evenly.
- The two earlier engines cannot give that:
  - headless Chrome recording its own tab (ADR-0032) has no hardware encoder above 1080p and stalls every 1.8 s at 4K;
  - OBS's browser source (ADR-0033) shows some page frames twice and skips the next, because OBS samples the browser's frames on a clock of its own.
- Measured on 2026-11-11 with a frame counter drawn in the page:
  - Chrome presents every frame of the app at 4K (its own frame trace: 1203 of 1203);
  - ffmpeg's `gfxcapture` (Windows Graphics Capture) of a full-screen Chrome window into NVENC recorded the whole of Go with the Flow with no repeated frame and 8 of 11 873 lost, all around Play and the song's end.
- The owner watched that recording: the strip scrolls smoothly throughout.
- ffmpeg cannot record the PC's sound output on Windows. OBS can record one program's sound (Application Audio Capture).

## Decision

`npm run record-video -- <slug>` records the app from the screen on Windows (`--engine screen`, the default there; `obs` elsewhere). The page is driven as in ADR-0032: the same settings, YouTube chosen, Space pressed, the same lead-in, tail, `--seconds` and `(incomplete)` naming.

**Picture.**

- Playwright starts the installed Chrome with a window, one device pixel per CSS pixel (`--force-device-scale-factor=1`), and puts it in full screen over CDP (`Browser.setWindowBounds`). `--kiosk` alone does not fill the screen.
- The recording has the screen's resolution. `--size` is only a check: with a size other than the screen's, the script refuses to start.
- The window's title is `bass-guitar-sifu-recorder`, so ffmpeg and OBS find it.
- ffmpeg records that window: `gfxcapture=window_title=…:max_framerate=<2 × fps>:capture_cursor=0`, into `h264_nvenc` at constant quality 20, preset P4 with high-quality tuning, no B-frames, a key frame every 2 s.
- Each frame keeps the time it was shown (`-fps_mode passthrough`). The file has a variable frame rate that follows the screen (59.9966 Hz here), and a lost frame shows as one longer frame, not as a shift against the sound.
- Windows Graphics Capture hands over a frame only when the window changes. The page therefore changes one pixel in the bottom right corner between `#000` and `#010101` on every frame.
- ffmpeg comes from `FFMPEG`, the PATH or winget's folder (`winget install Gyan.FFmpeg`).

**Sound.**

- OBS records only Chrome's sound: scene `Sound` with one Application Audio Capture source, `Chrome sound`, pointed at the recorder's window. Every other source is muted.
- OBS writes an MKV with uncompressed sound (24 bit, 48 kHz) and a 320 × 180 picture that is thrown away. The profile and scene collection are the recorder's own (`bass-guitar-sifu`), and OBS is started and reached as in ADR-0033.
- The sound also plays on the speakers.

**Joining the two.**

- After the tail the script notes the end, pauses the player if it still plays, waits 0.8 s, and gives a marker: a 1 kHz beep of 80 ms, and a white block in the top left corner from the frame in which the beep starts. Then both recorders stop.
- The script finds the block in the last 8 s of the picture and the beep in the last 8 s of the sound.
- ffmpeg joins them: the picture copied as recorded, the sound moved so the beep meets the block and then 67 ms later (`MARKER_SOUND_EARLY_MS`, see Consequences), encoded as AAC 320 kbit/s. The file ends 0.1 s before the noted end, so neither the pause nor the marker is in it.
- Without a marker (a failed or stopped recording) the picture is saved without sound as `(incomplete)`, and OBS's sound file is kept. `RECORD_JOIN="<picture>|<sound>|<ms>"` joins two such files again.

**The display may be off.** `--display-off` has Windows turn the display off (`SC_MONITORPOWER`) once the capture runs, for the owner's OLED screen. Windows goes on composing and the capture is unchanged. Moving the mouse turns the display on again and does no harm.

**Checks.** The script refuses to start when the PC is locked, and stops when ffmpeg gets no frames within 15 s. After each song it logs the number of frames and of gaps longer than one frame.

**Test switches** (environment variables, off by default): `RECORD_AUDIO_OFFSET_MS` adds to the sound's shift, `RECORD_SCREEN_SOURCE` records a test picture in place of the window, `RECORD_COUNTER=1` draws the frame counter, `RECORD_DEBUG` logs Chrome's audio latency.

## Consequences

- The PC must be unlocked, and the screen and speakers are taken for the length of each song. All 58 songs are about 6.5 hours.
- It needs OBS Studio, ffmpeg and an NVIDIA encoder.
- **The recording is as large as the screen is at that moment.** A batch on 2026-11-12 came out at 1920 × 1080 because the monitor (ROG XG32UCWMG, dual mode) was in its FHD mode. A batch that must be 4K passes `--size 3840x2160`.
- **Results** (2026-11-12, in `E:\sifu-videos`): Go with the Flow and the 21 Motorpsycho songs, all 3840 × 2160, recorded with the display off.
  - 9 to 35 gaps longer than one frame per song, about one per 40 s: a few around Play and at the end, the rest single frames of 25 to 33 ms. A K9 Suite: 35 in 106 212 frames (29 minutes).
  - About 11 Mbit/s: 270 MB for Go with the Flow (3:09), 9.6 GB for the 21 songs.
- **The sound's timing.** The owner takes OBS's sound-to-strip timing (ADR-0033) as right. Joined on the marker alone, the sound was 72, 69 and 60 ms early against the strip in three recordings, measured against a fresh OBS recording. `MARKER_SOUND_EARLY_MS = 67` corrects that; Go with the Flow then has the sound 10 ms late. The cause is not established, and another PC or sound device may need another value.
- The YouTube picture is about a frame earlier against the strip than in an OBS recording (8 to 17 ms). Not corrected.
- **YouTube player error 5** stops about one recording in ten at 0:43 to 0:45. Not explained. The file is saved as `(incomplete)`, and a batch with `--skip-existing` run again records only those songs.
- The file has a variable frame rate. YouTube accepts that; a player that assumes 60 fps would drift by 11 ms in three minutes.
- OBS 33 shows a "Crash Detected" dialog and never starts its server when its last run left a marker in `.sentinel`. The script removes those markers before it starts OBS, and waits until OBS takes requests.
- Not explained: the few frames lost around Play and at the song's end; and one 50 s test, started from a hidden console window, that lost 1.5 frames a second.
- The 36 songs not recorded again are still OBS recordings with repeated frames.

## Alternatives

Each was measured with the frame counter on Go with the Flow in 4K.

- **OBS's browser source** (ADR-0033): 3 to 20 % of the frames repeated, by luck per recording.
- **OBS at 120 fps over a 60 fps browser source**, one frame kept per page frame: still loses 1.6 % of the page frames.
- **OBS Window Capture of Chrome:** 76 to 201 repeated frames in 10.5 s. OBS takes frames on its own clock.
- **ffmpeg `ddagrab` (Desktop Duplication):** loses about one frame a second that Chrome did present.
- **Chrome recording its own tab** (ADR-0032): no hardware encoder above 1080p.
- **OBS recording the desktop's sound:** every sound of the PC would be in the recording.
- **An offline, frame-stepped render** with the YouTube picture and sound laid in afterwards. Correct by construction and needs no screen, but it needs a render clock in the app and a compositing step. Not needed while the screen capture is clean.
