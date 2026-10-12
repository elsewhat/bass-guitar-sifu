# ADR-0028: YouTube source on its own clock, synced with Songsterr's bar points

Status: Proposed (implemented, awaiting owner review), amended by ADR-0029 (anchors measured in the recording where Songsterr's points are off)
Date: 2026-10-11
Amends: ADR-0008 and ADR-0017 (the YouTube clock), ADR-0016 (where the sync comes from), ADR-0013 (`media.youtube.songsterr`), ADR-0015 (the skill's video step), ADR-0011 and ADR-0012 (Songsterr's timings in the repository), ADR-0020 (the Video channel is applied), ADR-0024 (subtitle band), ADR-0025 (count-in with a video).

## Context

- The owner asked (2026-10-11) for YouTube playback of every song, with the video Songsterr uses for the tab, driven by the chunks, the loop and the transport bar. The owner noted that the music may not start at 0:00 of a video.
- The earlier plan was different: ADR-0016 has the owner tap the sync anchors in an editor, and ADR-0017 plays YouTube through alphaTab's external-media mode. The source was put on hold on 2026-09-30.
- **Songsterr has the sync already.** The `.gp` files come from Songsterr. For every tab revision Songsterr lists its videos, and for each video one *point* per bar: the video time at which the bar starts. The video with `feature: null` is the default one, the original recording. The date in a `.gp` file name is the date of the revision it was exported from.
- **One offset is not enough.** Against the score's tempo map the recordings drift by 0.1 to 45 s over a song: Bullet in the Head 7.9 s, The Wheel 15 s, Peter Gunn 28 s, New York, I Love You 30 s, Un Chien d'Espace 45 s. Only a point per bar keeps the tab on the music.
- **The points do not always match the file bar for bar.** For 18 of the 31 videos in use there is one point per bar. For the other 13 the list is 1–3 entries shorter or longer: it stops before the last bars, has a point at the very end, or splits one bar in two (Come As You Are bar 107, Freedom bar 89, Zombie bar 107).
- **What the IFrame API does**, measured in Chromium on 2026-10-11:
  - `setPlaybackRate` takes any rate from 0.25 to 2 (0.85 gives 0.85), not only the listed ones.
  - `getCurrentTime()` runs on smoothly while the state is "playing" (within 2 ms of a straight line). In any other state it stands still.
  - After `playVideo()` on a paused video or `seekTo()` on a playing one, the video is heard again after about 50 ms, but the state stays "buffering" for 250–300 ms, and then the time jumps to where the video really is.
  - For 10–25 ms after `seekTo()` the old position is still reported.
  - A video that has never played takes 230–350 ms to start, and `seekTo` on it starts it.
  - `cueVideoById` followed within about 200 ms by `loadVideoById` cancels the load.

## Decision

**The video.** `media.youtube.videoId` is the default video of the Songsterr tab. When that video cannot be played from Norway, another video from the tab's list is used, and `notes` says so (Go With The Flow: the Topic upload is blocked, the official video is used).

**The sync.** `media.youtube.sync` holds one anchor per bar, taken from Songsterr's points for that video. `media.youtube.songsterr: { songId, revisionId }` records the tab and revision, so a later run fetches the same data.

- `npm run fetch-video -- <slug> [--write]` (`scripts/fetch-video.ts`, `scripts/lib/songsterr.ts`) finds the tab (same artist, most track names in common with the `.gp`), takes the revision that was current on `source.date`, reports the video and the sync, and with `--write` replaces `media.youtube` in `song.yaml`. `--video`, `--song` and `--revision` override the choices.
- `alignPoints` (`scripts/lib/video-sync.ts`, pure, tested) turns points into anchors:
  - with as many points as bars, point *i* is bar *i*;
  - otherwise points and bars are matched by their durations (dynamic programming): two points may share one bar, one point may cover two bars, and what is left over is placed at the end of the song;
  - bars without a point get no anchor;
  - points before 0:00 or not after the one before are dropped.
  The report lists what was merged, left out or far from the score's bar length. The same text is in each song's `notes`, for the owner to check by ear.
- The build rejects anchors that point outside the score or do not move forward, and warns about a video without anchors.
- The tap editor of ADR-0016 is not built. Anchors can be corrected by hand in `song.yaml`; the editor remains an option if Songsterr's points turn out wrong for a song.

**The sync map** (`src/core/sync.ts`, pure, tested): `secondsAt(tick)` and `tickAt(seconds)`. Between two anchors the video time is interpolated linearly over *score time*, so tempo changes inside the stretch keep their shape. Before the first and after the last anchor the video runs at the score's tempo. One anchor is an offset; none means the video starts with the score.

**The clock.** `YouTubeClock` (`src/playback/youtube-clock.ts`) implements `PlaybackClock` (ADR-0018) over a `VideoPlayer` port, like the Music clock (ADR-0022), and not through alphaTab's external-media mode as ADR-0017 planned. alphaTab's player would have to be switched on (worker, soundfont) only to report positions, and its sync points live in the score, which this app unrolls.

- It works in video time and converts to ticks through the sync map.
- **Loop.** A 10 ms timer watches the range end. It asks `onRangeEnd` 0.25 s before the end and seeks when the end is heard. A chunk that continues right after the current one needs no seek, so play-through has no gap. At the end of the song the video is paused and put back at the chunk start.
- **Start and seek.** After a play or seek command the clock assumes the video is heard again after 50 ms and runs on from the target. When the player reports "playing", the clock corrects toward its time: at once above 0.25 s, else with a 0.25 s time constant. If no report has come after 0.6 s, the clock goes back to the target and waits there.
- **Old positions.** For 1.5 s after a seek, reports that do not fit the seek are ignored. Otherwise the old position, still reported right after the seek, would count the wrap twice.
- **Buffering** in the middle of playing holds the position.
- **Position limits.** `getTick()` stays inside the range: at the range start until the video passes it, and one tick before the end until the wrap.
- **Tempo.** `capabilities.rates` is `continuous`: the tempo control works as for the Synth (40–100 %). The clock extrapolates with the rate the player reports, so the tab follows the video even if a browser rounds the rate.
- **Clicks on the video.** A click pauses or starts the video in the player itself. The clock sees the state change (not within 1 s of its own commands), follows, and tells the engine through `onExternal`, so the Play button shows the right state. A video that ends before the score does stops the same way.
- **Count-in (ADR-0025).** When the count-in starts, the player gets the video ready at the start position (below). `playVideo()` is called 50 ms before the count-in ends, so the video is heard on the downbeat.

**The player** (`src/playback/youtube-player.ts`) wraps the IFrame API, loaded from `youtube.com/iframe_api` when YouTube is first chosen. The frame comes from `youtube-nocookie.com`. Nothing is downloaded or stored (ADR-0011).

- `controls=0`, `disablekb=1`, `fs=0`, `rel=0`: the transport bar drives the video.
- A video that has never played cannot be paused at a place. `prepare` loads it muted, pauses it when it has started, seeks to the place and gives the sound back. The clock does not see these states. The video is never cued at a place, because of the cancelled load above; a never-started video only remembers its place.
- A click on the video moves the keyboard focus into the frame. The player hands it back, so Space and the arrow keys keep working.
- Mixer (ADR-0020): `setVolume(round(master × Video × 100))`, and `mute()` when either is muted.
- Player errors (removed, embedding off, blocked in the country) set the source status to an error with a plain message.

**UI.**

- The video fills the video cell. The source switch, the chips and the buttons lie over its corners, as the design has them, and take no clicks from the rest of the video.
- "Loading video…" or the error text shows over the player until it is ready.
- The count cells show over the video during a count-in. The video is dimmed behind them (black at 90 %): it is paused then, and a paused embed shows YouTube's own title and "More videos" shelf.
- The loop chip shows the loop's place in the recording: `Loop 0:20–0:30 · video time`.
- Synced lyrics are a subtitle band above the chips: the current line with the sung word lit, and the next line (ADR-0024). Unsynced lyrics are not shown over the video, and the lyrics button is disabled for them while YouTube is the source.
- YouTube is disabled for a song without `videoId`.

## Results

Measured against the real player in headless Chrome (Creep, chunk 1 looped, 2026-10-11):

| What | Result |
|---|---|
| App tick against the video's own time, while playing | median 0.3 ms, 95 % within 2 ms |
| The same right after a loop wrap, when the player's first report arrives | 5–12 ms |
| Gap in the sound at a loop wrap | about 50 ms (the player's seek) |
| Video heard after the count-in | within about 10 ms of the downbeat |
| Play-through into the next chunk | the player stays "playing": no seek, no gap |

All 31 videos load and play from the owner's machine through the app.

## Consequences

- Every song has a synced YouTube source without tapping. New songs get it from `fetch-video` in the skill.
- The sync is as good as Songsterr's points. Bars flagged by the alignment are listed in each song's `notes`; they have not been checked by ear.
- Songsterr's bar timings are now in the repository and on the public site, about 4500 numbers in all. They have the same status as the `.gp` files they belong to (ADR-0012): the owner accepts that they may have to be removed on request.
- `fetch-video` reads Songsterr's JSON endpoints, which are not a documented API and may change. It waits 1.2 s between requests.
- Some of Songsterr's default videos are third-party uploads: a lyric video (bad guy), a vinyl rip (The Lost Art of Keeping a Secret), a pitch-corrected upload (War Pigs), a live recording (The Wheel, whose tab follows that take). They can disappear. `fetch-video --video <id>` switches to another video of the tab.
- A loop wrap has a gap of about 50 ms, more when the start of the chunk is not buffered. Music and the Metronome remain the sources for tight loops.
- The video's audio output latency is not known and not compensated.
- **Overlays.** YouTube's developer policies do not allow page elements in front of the player. The design puts the source switch, two buttons, the chips and the subtitle band over the video cell, and the count-in dims the paused video. For the public site the owner should decide whether they stay there or move outside the video.
- The video needs network access to YouTube; the rest of the app stays static.

## Alternatives considered

- **alphaTab external media (ADR-0017).** See the clock decision above.
- **One offset per song.** Simple, and enough for the rendered MP3 (ADR-0022), but the recordings drift by seconds.
- **The tap editor (ADR-0016).** 31 songs and about 4500 bars to tap, for data that exists.
- **Fewer anchors** (drop those a straight line predicts within 30 ms). Smaller sidecars, but the anchors would no longer be Songsterr's points one to one. Not done.
- **YouTube's own controls (`controls=1`).** The seek bar would work against the loop.
- **A transparent layer over the video to take the clicks.** It would keep the focus in the page, but it is an overlay on the whole player; handing the focus back does the same job.
