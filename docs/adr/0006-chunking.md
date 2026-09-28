# ADR-0006: Chunking strategy

Status: Accepted, amended by ADR-0015 (agent-authored chunks)
Date: 2026-09-28

## Context

Practice is organised in chunks of a few bars that loop. Two of six design-time files have section markers (Creep: 8, Black Hole Sun: 11); the Motorpsycho files have none or only an intro marker. Vortex Surfer's bass is silent for bars 1–129, 177–191 and 241–243.

## Decision

Automatic chunking at build time, overridable per song:

1. Tacet detection: bars that contain only rests form tacet ranges, excluded from chunks and skipped in playback. Bars that sustain a tied note are not tacet.
2. Sections from Guitar Pro markers are the top level where present.
3. Within a section, bars get a signature (string, fret, duration, tie per event). Phrases of 2–8 bars (target 4) are formed, with boundaries where the signature sequence repeats or changes.
4. An immediate repeat of a phrase is merged into one chunk named `<name> ×2`.
5. Names: section name plus letter (`Verse 1 a`) or sequential riff letters (`Riff A`), reusing the letter for identical phrases.
6. Sidecar `chunks` replaces the automatic result.

The Vortex Surfer chunks agreed in the design (`reference/vortex-surfer-chunks.json`) are the acceptance fixture:
Riff A 130–133, Riff A ×2 134–141, Climb 142–147, E pedal 148–159, Descent 160–176, Return 192–207, Rise 208–219, Half-step 220–231, Outro 232–240.

## Consequences

- New songs get usable chunks without manual work; the sidecar handles cases where the heuristic is wrong.
- The chunk list in the practice plan is stable between builds as long as the `.gp` file does not change.
