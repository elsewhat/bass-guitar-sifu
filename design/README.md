# Design reference

Exported from the Claude Design canvas "Bass trainer" on 2026-09-28. These files are the visual and behavioural reference for the practice view. They are prototypes and not production code.

## Contents

| Path | What it is |
|---|---|
| `artboards/Main.dc.html` | Practice view, 1440 × 900. Interactive prototype: play, loop, passes, auto-advance, tempo, sources incl. Count mode, song library overlay, collapsible practice plan. |
| `artboards/SelectorOverlay.dc.html` | Wrapper that shows `Main` with the song library open. |
| `artboards/TabStrip.dc.html` | Notation and tab strip component (1408 × 276). |
| `artboards/Fretboard.dc.html` | Fretboard with hand component (673 × 208, scalable). |
| `tokens/nocturne-tokens.json` | Nocturne design system tokens (colour, type, spacing, radius, shadow). |
| `tokens/nocturne-README.md` | Nocturne usage rules. |
| `tokens/tokens.css` | Tokens as CSS custom properties, plus the string colours from ADR-0009. |
| `screens/` | Place PNG exports of the artboards here (see below). |

## Reading a `.dc.html` file

- Markup inside `<x-dc>` is the view. `{{name}}` is a value from `renderVals()`; `<sc-for list="{{items}}" as="item">` repeats; `<sc-if value="{{flag}}">` shows conditionally; `<dc-import name="TabStrip" …>` embeds another artboard with props.
- `<script type="text/x-dc">` holds a class `Component extends DCLogic`. `renderVals()` computes everything the markup shows; `state` and `setState` work like React class components.
- `data-props` on the script tag lists the design's adjustable parameters and their defaults (passes per chunk, start tempo, palette, selector variant, practice plan open).
- `./support.js` is the canvas runtime and is not included. The files do not run outside the canvas; read them as specifications.

Values worth copying exactly: grid sizes and gaps in `Main.dc.html`, the colour and opacity values, the fade timing in `tick()` (fade over 0.9 × note duration to 28 % opacity), the strip geometry in `TabStrip.dc.html` (bar width 208 px, note spacing 24 px, playhead at 180 px, staff line spacing 9 px, tab line spacing 20 px), and the fretboard geometry in `Fretboard.dc.html`.

The chunk and fingering data hard-coded in the artboards matches `reference/vortex-surfer-chunks.json`.

## Screens

Export PNGs from the canvas (Share › Export) for `Practice view` and `Practice view · song library open` and save them here as `practice-view.png` and `song-library.png`. Claude Code can read images and use them to check layout.
