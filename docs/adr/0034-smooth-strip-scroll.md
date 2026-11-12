# ADR-0034: Smooth strip scroll: gradual speed changes, a steadied frame tick and a loop label of its own

Status: Proposed (implemented, awaiting owner review)
Date: 2026-11-10
Amends: ADR-0017 (the scroll mapping and where the loop label is drawn), ADR-0008 (the tick the frame loop hands to its listeners).

## Context

The owner saw uneven scrolling in the practice videos (ADR-0033), with Go with the Flow as the example: the loop label above the strip did not stand still at the left edge, and the fret numbers did not always move evenly. The recordings were checked first and reproduce the app frame for frame, so the cause is in the app.

Measured in the live app on Go with the Flow (1440 × 900, 60 fps, about 3 px of strip movement per frame; multiply by 2.67 for a 4K recording):

| Cause | Measured |
| --- | --- |
| **Loop label.** It was an SVG group inside the scrolling surface, moved back each frame by a whole number of pixels, while the surface moves by fractions. | It moved on 1684 of 1732 frames while held, by up to 1.15 px. |
| **Speed jumps in the scroll mapping.** `playheadX` limits the two-beat average to 10 px from the exact note-to-note mapping. Where the limit holds it follows the exact mapping, whose speed jumps at every onset where alphaTab's spacing changes, most at barlines. ADR-0017 said the speed stays continuous; it does not. | The speed changed by up to 2.25 px from one frame to the next (0.80 to 5.18 px per frame over the song). |
| **Clock corrections.** Each clock extrapolates between the reports of its player and corrects itself at every report, and it reads the time when the frame callback runs, about 0.5 ms (sometimes several ms) after the frame's own time. | Per-frame steps varied by 0.14 px RMS with YouTube and 0.21 px with Synth; 25 and 50 steps in 30 to 40 s were off by more than 0.5 px. |

## Decision

### Scroll mapping (`src/strip/scroll.ts`)

- The strip follows `scrollMap(beatAnchors, maxOffset)`: the bounded mapping `playheadX` of ADR-0017, **averaged over one beat** (960 ticks). The average spreads every speed jump over a beat.
- The window of the first average is **one bar of 4/4** (3840 ticks; it was two beats, amended 2026-11-10, see below). The 10 px limit is unchanged. Notes are a little further from the playhead when they are plucked: at most 14.7 px on Go with the Flow (8.7 px before this ADR, 12.4 px with the two-beat window), 11.2 px for 95 % of the notes, 6.3 px for half of them. The e2e test keeps its limit of 15 px.
- `scrollMap` is computed once per layout into a table with a value every 30 ticks, the averages as running sums (6 ms for Go with the Flow's 955 anchors); a frame interpolates in the table.

### Frame tick (`src/playback/frame.ts`)

- The frame loop hands its listeners a **steadied tick**, `frameTick`, instead of the clock's tick as read. The shown tick advances at its own speed by one even step per frame, and tick and speed are pulled toward the clock by a critically damped loop of about 1 Hz. It has no lag at a constant speed, and follows a tempo or rate change within a few tenths of a second.
- The clock's tick is taken back by the delay between the frame's time and the moment it was read.
- The frame step is the averaged frame period, unless a frame was clearly early or late (more than 20 % off), when the real time is used.
- Where the clock stands still (pause, count-in, range end) or its tick is more than 60 ms of playing time from the shown one (seek, loop wrap, a clock that snaps), the shown tick is the clock's tick. The speed is then found again from the next frames; the first step after a standstill is skipped for that, as it may cover part of a frame.
- The clocks and the `PlaybackClock` interface are unchanged. Everything that needs the exact position (loop wraps, pass counting, what is stored) reads the clock, not the frame tick.

### Loop label (`src/strip/strip.ts`)

- The loop label is an HTML element beside the scrolling host in the clip area, with its own transform. While the loop start is scrolled out of view its position is a constant (8 px from the left edge), so it does not move at all. Otherwise it moves with the loop start, and it stops at the loop end, as before.
- Text, colours, size and position match the SVG label it replaces. The bracket, the dimming and the next-chunk label stay in the SVG overlay.

## Consequences

Measured the same way after the change (Go with the Flow, 40 s):

| | Before | After |
| --- | --- | --- |
| Loop label while held: frames on which it moved | 1684 of 1732 | 0 (it moves only when the chunk changes) |
| Largest speed change between two frames (mapping) | 2.25 px | 0.09 px |
| Speed range over the song (mapping) | 0.80 to 5.18 px per frame | 0.79 to 3.70 px per frame |
| Step jitter, YouTube | 0.139 px RMS, 25 steps off by > 0.5 px | 0.018 px RMS, none |
| Step jitter, Synth | 0.206 px RMS, 50 steps off by > 0.5 px | 0.066 px RMS, 11 |

- The speed still varies with alphaTab's spacing: bars of long notes and rests are engraved narrower per beat than bars of eighths, so the strip slows down there. Only a layout with time-proportional spacing would remove that.
- With Synth, a change of chunk still shows as a short stall. alphaTab seeks to the new chunk's start when the wrap is heard (ADR-0018, ADR-0019) and the main thread is busy for 12 to 25 ms then; the clock steps back by about 40 ms and the frame tick follows it. YouTube, Music and Count have no such step. Not changed here.
- A note can be up to about 12 px from the playhead line when it is plucked, instead of 9 px.
- Per-frame views other than the strip (count cells, Now square, fretboard, lyrics) get the same steadied tick. It differs from the clock's by a few ms of playing time at most.
- Practice videos recorded before this change keep the old scrolling; they need to be recorded again (ADR-0033).

### Amendment 2026-11-10: a bar's average

The owner still saw the notes stutter in Chrome after the change. Measured in a maximized Chrome window at the screen's own scaling (4K at 150 %), the first 10 s of Go with the Flow:

- Chrome shows the frames: 0 or 1 dropped in 8 s of scrolling, as on a bare page that only moves a striped strip. (In a window larger than the screen, Chrome dropped 2 % of the frames; that was the test setup.)
- The strip sped up and slowed down once per bar, in a bar of even eighths: 2.68 to 3.21 px per frame (±9 %) every 1.5 s. alphaTab leaves room after each barline, and neither a two-beat average nor a one-beat average evens out something that repeats once a bar.
- With the first average over one bar: 2.85 to 3.08 px per frame (±4 %) in the same seconds. Over the whole song the speed swing within 1.5 s goes from 24 % to 11 % (median) and from 60 % to 42 % (90th percentile).
- The price is the onset offsets above. A wider last average (two beats) evens the speed further (4 %) but puts notes up to 18 px from the playhead, past the e2e limit.
- alphaTab has no time-proportional spacing: it spaces by springs (`stretchForce`) and pads the barlines. So the room after the barline can only be traded against the distance from the playhead, not removed.
- The first 1.5 s after bar 1 still speeds up: bar 1 also holds the clef and time signature.

## Alternatives

- **A wider smoothing window or a larger limit, without the last average.** Measured on Go with the Flow: the speed jumps stay as long as the limit can hold (0.55 to 1.6 px between frames for limits of 16 to 32 px and windows of two beats to a bar), and the notes move further from the playhead (up to 18 px).
- **No limit at all** (plain average over a bar): the smoothest speed, but notes are up to 21 px from the playhead when plucked, which the owner ruled out on 2026-09-29.
- **Using the `requestAnimationFrame` timestamp inside the clocks.** It removes the callback delay only; the clocks' own corrections are the larger part, and timer callbacks (the range watch) would still read another time.
- **Rounding the strip to whole pixels** so the SVG label's rounding matches: the strip would then move in uneven whole steps at about 3 px per frame.
