# ADR-0009: String colour palette

Status: Accepted
Date: 2026-09-28

## Context

Each string has a fixed colour used in the tab circles, the fretboard strings, the active finger, and the Now/Next squares, so the string can be recognised without reading. Three palettes were tested in the design: Rocksmith order (red, yellow, blue, orange), green E (green, yellow, blue, pink) and dark-to-light. Green on the E string was too close to the UI accent `#1ed760` used for play, loop and current-chunk markers.

## Decision

Dark-to-light palette, lowest string darkest:

| String position | Fill | Text |
|---|---|---|
| 1 (lowest, E in standard) | `#7c3aed` | `#ffffff` |
| 2 (A) | `#0ea5e9` | `#000000` |
| 3 (D) | `#f59e0b` | `#000000` |
| 4 (G) | `#fde047` | `#000000` |

Colours follow string position, not pitch name, so drop D and C♯ standard use the same colours.

## Consequences

- Colours differ in lightness as well as hue, which helps with colour-vision deficiencies.
- The UI accent stays green and is not used for strings.
- These are the only chromatic colours besides the accent; the rest of the UI follows the Nocturne tokens.
