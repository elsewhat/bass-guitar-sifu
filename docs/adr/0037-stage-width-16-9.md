# ADR-0037: The stage is as wide as the window, from 16:10 to 16:9

Status: Proposed (implemented, awaiting owner review)
Date: 2026-11-12
Amends: the layout of the system description (§3) and of `design/artboards/Main.dc.html`, which are 1440 × 900 (16:10).

## Context

- The practice view was a fixed stage of 1440 × 900 px, scaled as a whole to fit the window. On a 16:9 screen it was limited by the height, which left 5 % of the width empty on each side (96 px of 1920).
- The owner's screen and the practice videos (ADR-0035) are 16:9. The owner asked (2026-11-12) to use that width, and to keep 16:9 on screens that are wider still.

## Decision

- The stage is 900 px high and **1440 to 1600 px wide**: 900 px × the window's aspect ratio, kept inside those limits (`stageWidth` in `src/layout.ts`). It is scaled as a whole and centred, as before.
  - 16:10 and narrower (1440 × 900, 1280 × 800, 4:3): 1440 px wide, the design's layout unchanged.
  - Between 16:10 and 16:9: the stage follows the window, with no empty sides.
  - 16:9: 1600 × 900, which fills the screen.
  - Wider than 16:9 (21:9, 32:9): 1600 × 900, centred, with the page's background on both sides.
- The extra width (up to 160 px) goes to:
  - **the video cell** first, up to 711 px, a 16:9 picture of its 400 px height (`videoWidth`). With the practice plan open it grows from 619 to 711 px; with the plan collapsed it already is 711 px;
  - **the fingering column**, which takes the rest (`fingeringWidth`): 505 to 573 px with the plan open, 617 to 777 px collapsed. The fretboard is scaled with the column, from the design's 0.75 (plan open) and 0.9 (collapsed) up to full size;
  - **the header, the transport bar and the strip**, which span their columns. The strip's clip area is 1336 to 1496 px wide. The playhead stays at 150 px, so the extra width shows more of the bars to come.
- The practice plan keeps its width (260 px, or 56 px collapsed). The mixer and the song library keep their size and are centred on the stage.
- Components read the stage's width with `useStageWidth()` (`src/components/Stage.tsx`).

## Consequences

- A 16:9 screen is filled. At 1920 × 1080 everything is the size it was (scale 1.2), and the video cell, the fretboard and the strip are wider.
- Practice videos are 16:9 with no empty sides. Videos recorded before this change have them; they need to be recorded again to match.
- The design artboards stay at 1440 × 900. The app matches them at that size; on a wider stage the widths above differ from them.
- The YouTube picture is 16:9 in a 711 × 400 cell, so it no longer has black bars at the top and bottom on a 16:9 screen with the plan open.

## Alternatives

- **A 1600 × 900 stage for every window.** A 16:10 screen would then be limited by its width and lose 10 % of its height, and the design's layout would hold nowhere.
- **Stretching the stage to any width.** On a 21:9 screen the strip would be very long and the video cell could not use the width; the owner asked to keep 16:9 there.
- **Giving all the extra width to the fingering column.** The video would keep its bars above and below, and the fretboard does not need 160 px more.
