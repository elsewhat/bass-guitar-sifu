# ADR-0005: Custom SVG renderer for the notation and tab strip

Status: Superseded by ADR-0017 (alphaTab engraves; our overlays)
Date: 2026-09-28

## Context

The design needs things a general notation renderer does not provide out of the box:

- tab notes as filled circles in string colours with the fret number inside,
- a fixed playhead with content scrolling underneath at animation-frame rate,
- a loop bracket, dimmed out-of-loop bars, re-tab labels, next-chunk preview,
- notation and tab aligned note by note in one horizontal strip.

alphaTab can colour fret numbers and note heads per note (`NoteStyle`, `NoteSubElement.GuitarTabFretNumber`, since 1.5) and has a horizontal layout, but it draws text fret numbers, not filled circles, and changes need a full re-render.

Scope is limited: one bass track, one voice (all six design-time files use a single voice), 4 strings.

## Decision

Write a dedicated SVG renderer for the strip:

- Fixed gutter (clef, time signature, TAB, string badges) and a scrolling group translated by the clock.
- Horizontal layout with bar width proportional to bar duration and a minimum spacing per note.
- Notation subset: bass clef, written an octave above sounding pitch; note heads for whole to 32nd; stems; beams grouped by beat (by half bar for eighths in 4/4); flags; dots; ties; rests; ledger lines; accidentals per bar with key signature from the file; tuplets; time signature changes.
- Only bars within ±2 viewport widths of the playhead are in the DOM.

## Consequences

- Full control over the look defined in the design.
- Engraving quality is the team's responsibility. Visual regression tests with Playwright screenshots for the six songs.
- If notation engraving becomes too costly, alphaTab can render the notation lane alone with the tab lane kept custom, provided x positions are taken from alphaTab's bounds lookup.
