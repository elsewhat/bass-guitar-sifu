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

- **Build.** `build:songs` exports the bass track as alphaTab JSON (`public/data/scores/<slug>.json`). Fingering re-tabs are applied to string and fret in that file.
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

## Consequences

- There is much less engraving and audio code.
- The bundle grows by about 1 MB, plus a soundfont (lazy-loaded). alphaTab needs its Vite plugin for the worker and the audio worklet.
- The notation font and spacing follow alphaTab rather than the artboard's exact geometry.
