# ADR-0017: alphaTab at runtime for the strip, Synth and YouTube sync

Status: Accepted (spike passed, owner review 2026-09-28)
Date: 2026-09-28
Supersedes: ADR-0005 (custom SVG renderer). Amends: ADR-0008.

## Context

ADR-0005 chose a custom SVG renderer, which means building beams, ties, accidentals, tuplets and meter changes ourselves. ADR-0008 also needs a synth and a sync map for YouTube. alphaTab 1.6–1.8 offers most of this:

- per-note colours (`NoteStyle` / `NoteSubElement`, since 1.5),
- `LayoutMode.Horizontal`,
- a player with a soundfont, `playbackSpeed`, and `playbackRange` with looping,
- `PlayerMode.EnabledExternalMedia` with an `IExternalMediaHandler` and sync points (1.6).

It cannot draw tab notes as filled circles, and its own cursor and scroll do not match the design. A spike (`spike.html`, `src/spike/spike.ts`, removed after slice 1; see git history) tested a hybrid on Vortex Surfer and Killing in the Name.

## Decision

alphaTab **engraves** the notation and tab and **plays** the Synth source. Everything that moves or highlights is our code on top of alphaTab's bounds lookup.

- **Score delivery.** The app loads `score.gp` with alphaTab's importer. It gets the file as `<base>data/scores/<slug>.gp`, which the `song-scores` Vite plugin (`scripts/vite-song-scores.ts`) serves from `songs/<slug>/score.gp` in dev and emits into the build.
  - The bass track is `song.track.index`.
  - The fingering re-tabs are applied in the browser from the song JSON (`applyRetabs` in `src/strip/alphatab-score.ts`).
  - An exported alphaTab JSON score was tried first and dropped. It was 1.6–1.9 MB per song even with only the bass track, against 50–100 KB for the `.gp`.
- **Engraving.** Horizontal layout with the ScoreTab stave profile, dark resources, 20 px tab lines, and a limited set of elements (below).
- **Scrolling and playhead are ours.** alphaTab's `ScrollMode.Off`, `enableCursor = false`, `enableElementHighlighting = false`. The strip is moved with `translate3d` from our clock. The mapping from tick to x is **"smoothed over 2 beats"**, chosen by the owner from the spike's comparison (below), and bounded so a note is inside the playhead band when it is plucked (owner, 2026-09-29; see Scroll mapping). The playhead band is fixed at 150 px in the clip area, so four eighth notes fit to its left (owner, 2026-09-29; it was 180 px).
- **Overlays are ours**, placed from `boundsLookup`:
  - 20 px string-coloured circles under every tab fret number,
  - the current tab note as a 26 px circle with a white ring and its fret number,
  - the green loop bracket and label,
  - dimming outside the loop,
  - the next-chunk label,
  - the "Retab · source A1" labels.
  - **The notation is not highlighted** (owner's decision); it stays white.
- **Fixed gutter is ours.** 72 px wide: "Bar", bass clef (Noto Music), current time signature, TAB, and string badges in string colours, highest string on top. It is positioned from the staff bounds.
- **Sources.**
  - **Synth:** the alphaTab player.
  - **YouTube:** `PlayerMode.EnabledExternalMedia` through an `IExternalMediaHandler` adapter over the IFrame API, with the sidecar sync anchors converted to alphaTab sync points.
  - **Count:** a custom Web Audio scheduler. It can drive alphaTab through the external-media mode, so all sources share one position source.
- **Clock.** `PlaybackClock` wraps alphaTab's position events and extrapolates at `requestAnimationFrame` rate (below). The loop controller, fretboard and Now/Next squares remain our code.

## Spike results

| Criterion | Result |
|---|---|
| Look | Accepted. The dark palette comes from `display.resources`. The notation staff space is 9 px (the alphaTab default, same as the design) and tab lines are 20 px apart. Hiding the effect bands keeps both staves inside 276 px: Killing in the Name, the busiest file, is 271 px, and anything taller is scaled to fit. Bar widths are driven by content (about 290 px for 8 eighths), not the artboard's fixed 208 px. |
| Scrolling | Accepted with "smoothed over 2 beats". The owner measured 60 fps in a normal browser. |
| Overlay alignment | Exact. The circles sit under the fret numbers, both while scrolling and after re-render. |
| Loop and speed | `playbackRange` + `isLooping` loop the chunk cleanly. `playbackSpeed` works. Passes are counted from the wrap. |

**Scroll mappings compared** (Vortex Surfer bars 130–176; the playhead band is ±15 px):

| Mapping | Worst note-onset offset | Speed max/min |
|---|---|---|
| Note to note (alphaTab's own smooth scroll) | 0 px | 2.49 |
| Smoothed over 1 beat | 12 px | 2.40 |
| **Smoothed over 2 beats (chosen)** | 18 px | 1.90 |
| Smoothed over 1 bar | 20 px | 1.74 |
| Constant per bar | 40 px | 1.05 |

Why no mapping is perfect: alphaTab spaces notes by content, not time, and each bar starts with an extra gap after the barline. That gap takes as long to cross as one note, so any mapping trades an even speed against notes landing on the playhead. alphaTab has no setting for time-proportional spacing.

## Implementation guide (everything the spike learned)

The spike became the strip in slice 1: `src/strip/strip.ts` (the `Strip` class, loaded lazily with alphaTab), `src/strip/scroll.ts` (scroll mapping), `src/strip/alphatab-score.ts` (`fetchScore`, `applyRetabs`, `colourNotes`, `stringPalette`) and `src/components/TabStrip.tsx`. `playerMode` starts as `Disabled` and is switched on the first time the Synth source is chosen, so the soundfont is only loaded then (ADR-0019).

**Settings**

- `core.fontDirectory = BASE_URL + 'font/'` and `player.soundFont = BASE_URL + 'soundfont/sonivox.sf2'`. The `@coderline/alphatab-vite` plugin copies these assets and sets up the worker and audio worklet. The plugin inside `@coderline/alphatab` itself is deprecated.
- `core.includeNoteBounds = true`.
- `display.layoutMode = Horizontal` and `display.staveProfile = ScoreTab`.
- `display.padding = [8, 28, 8, 8]`: left, top, right, bottom. The top padding leaves room for the loop bracket.
- `display.resources`: `staffLineColor #7c7c7c`, `barSeparatorColor #cbcbcb`, `mainGlyphColor #ffffff`, `secondaryGlyphColor #b3b3b3`, `barNumberColor #b3b3b3`, and `engravingSettings.tabLineSpacing = 20`.
- `notation.elements` set to false for:
  - score and track texts: ScoreTitle, ScoreSubTitle, ScoreArtist, ScoreAlbum, ScoreWords, ScoreMusic, ScoreWordsAndMusic, ScoreCopyright, GuitarTuning, TrackNames,
  - effect bands: EffectTempo, EffectMarker, EffectText, EffectHammerOnPullOffText, EffectSlideText, EffectPalmMute, EffectLetRing, EffectDynamics, EffectTripletFeel, EffectCapo, EffectChordNames.

  Otherwise the effect bands push the tab staff out of the strip.
- Fret numbers are coloured in the string's *text* colour with `colourNotes(track, s => stringPalette().text[s])`, so they read on the circles. `stringPalette()` reads the `--string-N` variables (ADR-0009).
- Player settings: `playerMode = EnabledSynthesizer` (set at runtime with `api.updateSettings()`, ADR-0019), `scrollMode = Off`, `enableCursor = false`, `enableElementHighlighting = false`.

**DOM and layering**

- alphaTab only renders into a container that has a size. Give the host an explicit width (the clip width); the horizontal layout overflows it.
- Structure:
  - `.strip` (1408 × 276)
    - `.clip` (left 72, 1336 wide, overflow hidden)
      - host (absolute, `transform-origin: 0 0`, moved with `translate3d(150 − x·scale, offsetY) scale(scale)`)
      - playhead band (left 135, width 30, top 24, height 212); `PLAYHEAD_X` and `PLAYHEAD_HALF_WIDTH` in `src/strip/scroll.ts`
    - gutter (72 px, above the clip, with a shadow)
- Two overlay SVGs sit in the host at 0,0, sized like `.at-surface`, which gets `position: relative`. The **back** layer is inserted before `.at-surface` and holds the string circles and the current-note ring, so alphaTab's fret numbers draw on top. The **front** layer is appended after `.at-surface` (z-index 2) and holds the dimming, labels and bracket.
- The ring must not redraw the fret number: a redrawn number never matches alphaTab's glyph position exactly and visibly shifts (owner feedback, slice 1).
- The loop label slides right while the loop start is scrolled out of view, so it stays readable. The next-chunk label sits 26 px below the lowest tab line; staff heights differ per song, so fixed y values overlap the circles.
- alphaTab 1.8 always draws a "rendered by alphaTab" line below the first bar. There is no setting for it, and we leave it.
- Scale: `min(1, 272 / surfaceHeight)`, and centre what is left vertically.

**Bounds lookup quirks**

- `renderer.boundsLookup.staffSystems` holds one identical copy of the horizontal system per partial render. Dedupe master bars by `mb.index`.
- Bounds come back from the render worker **without `bar` references** (`BarBounds.bar` is undefined). Identify bars by `mb.index`; `beat.beat` and `note.note` are present.
- With ScoreTab, each master bar has two `BarBounds`: `[0]` is notation and `[1]` is tab. On the tab staff, `NoteBounds.noteHeadBounds` is the fret-number box, which is where the circles go. `visualBounds.y` of `[0]` and `[1]` give the tops of the notation and tab staves; tab line k (0 = highest string) is at `tabTop + 20k`.
- The key for mapping events to bounds is `${bar}:${beat.beat.playbackStart}`, which equals the song JSON's `${e.bar}:${e.tick}`.
- Rebuild the layout and overlays on `postRenderFinished`.

**Clock**

- Keep `{ tick, time }` and extrapolate with `bpmAt(tick) / 60 × 960 × playbackSpeed` ticks per second.
- On each `playerPositionChanged`:
  - snap on `isSeek` or while paused,
  - on a wrap (tick drops by more than one quarter), snap and count a pass,
  - on an error above one quarter, snap,
  - otherwise correct 20 % toward the reported tick.
- Clamp the prediction to `playbackRange.endTick − 1` so it never overshoots the loop end before the wrap event arrives.
- Snap on `playerStateChanged`. When changing speed, snap to the current prediction first.

**Scroll mapping ("smoothed over 2 beats")**

- `beatAnchors` holds `(bar.startTick + beat.playbackStart, beat.onNotesX)` for every notation-staff beat, plus the end of the last bar.
- `x(t)` is the mean of 17 samples of the piecewise-linear interpolation of `beatAnchors` over `[t − 960, t + 960]`.
- **Bound (2026-09-29, owner):** the strip uses `playheadX`, which is `exact + 10·tanh((smoothed − exact) / 10)` in screen px, where `exact` is the plain interpolation of `beatAnchors`. The lead or lag of the smoothed mapping is limited softly to 10 px, and the speed stays continuous. Measured at 120 % on Vortex Surfer: every note is within 12 px of the band centre when its ring appears (one frame of movement included). Four notes fit to the left of the band, or three right after a barline, whose extra gap takes the room.

**Current note** is the last note event with `start ≤ tick < start + dur`, found by binary search over the note events.

**Chunk loop**

- `playbackRange = { startTick: first.startTick, endTick: last.startTick + last.durTicks }`, `isLooping = true`, `tickPosition = startTick`.
- After 3 passes, with auto-advance on, set the next chunk's range.

## Consequences

- There is much less engraving and audio code than ADR-0005 required.
- The bundle is larger. The spike page is about 1.15 MB (277 KB gzip), and alphaTab's worker and worklet are about 2.3 MB each before compression; the soundfont is 1.35 MB. Load alphaTab and the soundfont lazily when the practice view opens a song.
- The notation font and spacing follow alphaTab, not the artboard's exact geometry.
- The smoothed mapping alone puts notes up to about 18 px off the playhead centre at bar starts, outside the ±15 px band. The bound (below) keeps them within 10 px, so a note is in the band when its count sounds and it gets the ring.
