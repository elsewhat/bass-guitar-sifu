# ADR-0027: Keep the screen awake while playing

Status: Proposed (implemented, awaiting owner review)
Date: 2026-10-06

## Context

- The player's hands are on the bass during practice. With the Metronome or a long play-through, nobody touches the keyboard or mouse for minutes, so the operating system dims the screen and locks it (owner, 2026-10-06).
- Audio playback alone does not stop the screen from sleeping. A video element can, but the Metronome, Synth and Music sources have none.
- The Screen Wake Lock API (`navigator.wakeLock.request('screen')`) keeps the screen on for a visible page in a secure context. Chrome, Edge and Safari support it, and so do recent Firefox versions. GitHub Pages and `localhost` are secure contexts.

## Decision

- `keepAwakeWhilePlaying` (`src/practice/wake-lock.ts`) holds a screen wake lock while the session's `playing` is true, count-in included, and releases it on pause and at the end of a play-through (ADR-0021).
- The browser releases the lock when the page is hidden (another tab, minimised window). On `visibilitychange` the lock is requested again if the page is visible and still playing.
- A request that fails (unsupported, refused in power-saving mode) is ignored; playback is unaffected and the system's sleep settings apply.
- The practice engine wires it to the session store; the module takes the API and the document as parameters, so it is unit tested with fakes.

## Consequences

- No UI: the lock follows Play and Pause. A paused session lets the screen sleep as usual.
- Without the API (older browsers, an insecure context) the behaviour is unchanged.

## Alternatives

- A hidden looping `<video>` (the NoSleep.js trick): works in older browsers but adds a media element and battery use for a problem the standard API already solves.
- A setting to switch it off: not needed while the lock only lasts as long as playback.
