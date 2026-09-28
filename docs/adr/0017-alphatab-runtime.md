# ADR-0017: alphaTab at runtime for the strip, Synth and YouTube sync

Status: Proposed. Accepted or rejected by the spike at the start of slice 1.
Date: 2026-09-28
Amends: ADR-0005 and ADR-0008.

## Context

ADR-0005 chose a custom SVG renderer, which means building beams, ties, accidentals, tuplets and meter changes ourselves. ADR-0008 also needs a synth and a sync map for YouTube. alphaTab 1.6–1.8 now offers most of this:

- per-note colours for tab fret numbers and note heads (`NoteStyle` / `NoteSubElement`, since 1.5)
- `LayoutMode.Horizontal` with `ScrollMode.Smooth`, which gives a steady cursor at a fixed position (1.8)
- a player with a soundfont, `playbackSpeed`, and `playbackRange` with looping
- `PlayerMode.EnabledExternalMedia` with an `IExternalMediaHandler` and sync points for YouTube (1.6)

alphaTab cannot draw tab notes as filled circles with the number inside.

## Decision (hybrid)

- **Score delivery.** The app loads `score.gp` itself with alphaTab's importer. It gets the file as `<base>data/scores/<slug>.gp`, which the `song-scores` Vite plugin (`scripts/vite-song-scores.ts`) serves from `songs/<slug>/score.gp` in dev and emits into the build. The bass track is `song.track.index`. Fingering re-tabs are applied in the browser from the song JSON (`src/strip/alphatab-score.ts`). An exported alphaTab JSON score was tried first and dropped: it was 1.6–1.9 MB per song even with only the bass track, against 50–100 KB for the `.gp`.
- **Rendering.** At runtime, alphaTab renders notation and tab in horizontal layout with smooth scrolling. Fret numbers and note heads are coloured per string.
- **Overlay.** A custom SVG overlay in the same scroll container uses `boundsLookup`. It draws the filled string circles, the loop bracket and label, dimming outside the loop, the re-tab labels and the next-chunk preview.
- **Synth.** The Synth source is alphaTab's player.
- **YouTube.** The YouTube source uses external-media mode through an adapter over the YouTube IFrame API. The sidecar sync anchors are converted to alphaTab sync points.
- **Count.** The Count source stays a custom Web Audio scheduler.
- **Clock.** `PlaybackClock` wraps alphaTab's player events and interpolates the position at `requestAnimationFrame` rate. The loop controller, fretboard and Now/Next squares remain our own code.

## Spike gate

One day on Vortex Surfer. The spike passes when all of these hold:

1. The strip looks close enough to `design/artboards/TabStrip.dc.html`.
2. Smooth scrolling is steady at 1440 px wide.
3. The overlay circles stay aligned while scrolling and after re-render.
4. The chunk loop and tempo change work with the synth.

If the spike fails, this ADR is rejected. ADR-0005 then applies as written, and alphaTab is used only for import.

## Spike results (2026-09-28, `spike.html`, alphaTab 1.8.4)

| Criterion | Result |
|---|---|
| Look | Close. The dark palette comes from `display.resources`. Notation is white, and the notation staff space is 9 px (alphaTab default = design). Tab lines are 20 px apart through `resources.engravingSettings.tabLineSpacing = 20`. Hiding title, tuning, track names, tempo, markers, text, H/P and slide text, palm mute, let ring, dynamics and chord names keeps both staves inside 276 px: Killing in the Name, the busiest file, renders 271 px tall. Bar widths are driven by content (about 290 px for 8 eighths), not the artboard's fixed 208 px. |
| Smooth scroll | Follows playback in `ScrollMode.Smooth`. Steadiness could not be measured from automation, because the hidden browser pane throttles `requestAnimationFrame`. **The owner needs to watch it.** |
| Overlay alignment | Exact. `boundsLookup` gives two `BarBounds` per bar with the ScoreTab profile: `[0]` notation and `[1]` tab. The tab beats' `noteHeadBounds` are the fret-number boxes, so circles drawn at their centres sit under the numbers. The overlay SVG sits behind `.at-surface` in the same scroll container. Quirks: bounds come back from the render worker without `bar` references (use `mb.index`), and the lookup holds one copy of the horizontal system per partial render (dedupe by bar index). |
| Loop and speed | `playbackRange` + `isLooping` loops the chunk (bars 1–4, ticks 0–15,360, wrapped cleanly). `playbackSpeed = 0.75` advances at the expected rate. Pass counting can detect the wrap in `playerPositionChanged`. |

The re-tabs are applied correctly. Vortex Surfer bar 130 shows E6, not the file's A1.

A further option came out of the spike. The Count source could drive alphaTab through `PlayerMode.EnabledExternalMedia`, with the Web Audio count scheduler acting as the "media". Every source would then share alphaTab's cursor and scrolling.

Pending: the owner's verdict on look and scroll smoothness.

## Consequences

- There is much less engraving and audio code.
- The bundle grows by about 1 MB, plus a soundfont (lazy-loaded). alphaTab needs its Vite plugin for the worker and the audio worklet.
- The notation font and spacing follow alphaTab rather than the artboard's exact geometry.
