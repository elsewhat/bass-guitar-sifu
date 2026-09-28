# ADR-0002: Frontend stack

Status: Accepted
Date: 2026-09-28

## Context

Single-page, static, desktop-first application with timing-sensitive UI (visual metronome at eighth-note rate, scrolling strip at animation-frame rate). The owner works with React, Lit, Tailwind and TypeScript.

## Decision

- Vite + React 18/19 + TypeScript (strict).
- Tailwind CSS for layout and spacing. Design tokens from `design/tokens/` are exposed as CSS custom properties and mapped into the Tailwind theme.
- State: a small store (Zustand) for session state (song, chunk, pass, tempo, source). Playback position is **not** kept in React state; components that follow the playhead subscribe to the clock and update the DOM or SVG directly in `requestAnimationFrame` callbacks.
- Rendering of the strip, fretboard and squares: inline SVG and plain DOM, no canvas.
- Tests: Vitest for pipeline and algorithms, Playwright for a smoke test of the built site.
- Font: Figtree (Google Fonts), as in the Nocturne design system.

## Consequences

- Re-render cost stays low because the per-frame work bypasses React reconciliation.
- Tailwind and CSS variables keep the token values in one place.

## Alternatives considered

- Lit web components: good fit for isolated widgets, but the state flow between panels is simpler in React.
- Canvas rendering for the strip: faster for very long songs, harder to style and inspect. Revisit if SVG performance is a problem for 577-bar songs (The Wheel); virtualise bars first.
