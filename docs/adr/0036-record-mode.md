# ADR-0036: Record mode: the view for a practice video, chosen in the address

Status: Proposed (implemented, awaiting owner review)
Date: 2026-11-12
Amends: ADR-0032, ADR-0033 and ADR-0035 (how `record-video` sets the app up).

## Context

- A practice video (ADR-0032) shows the app playing a song with YouTube from bar 1, every bar once. The source switch, "Restart chunk", the repeat button and "Next chunk" are in the picture and are never used in it.
- `record-video` set the app up from outside: it wrote play through into the settings and clicked the YouTube button.
- The owner asked (2026-11-12) for an address parameter that puts the app in this state.

## Decision

`?record=1` in the address turns record mode on (`recordMode` in `src/state/session.ts`). `record=0` and `record=false` leave it off. It is read once, when the app loads.

In record mode:

- **YouTube is the source.** It is chosen when the song loads. A song without a video falls back to the Metronome, as everywhere else.
- **Play through is the repeat mode.** The button that changes it is hidden, so the mode is fixed. It is not stored: the settings keep the repeat mode chosen outside record mode.
- **Hidden in the video cell:** the source switch. The lyrics and mixer buttons and the chips stay.
- **Hidden in the transport bar:** "Restart chunk", the pass counter with the repeat button, and "Next chunk". Play/pause and the tempo control with the BPM stay.
- Everything else is as usual: the keyboard shortcuts (the recorder presses `Space`), the practice plan, progress and the tempo. The song starts where it was left, or at bar 1 in a fresh browser profile, which is what `record-video` uses.
- The parameter stays in the address when the song changes.

`record-video` opens the app with `&record=1`. It no longer clicks the YouTube button, unless the page still has one (a deployed build from before this ADR). It still writes play through and the mixer levels into the settings, for the same reason.

The video cell has a `data-source` attribute with the source's id, next to `data-source-status`.

## Consequences

- The recorded picture has two controls under the video instead of five, and no source switch over it.
- With no source switch over the player, record mode has one element less in front of the YouTube player (section 13 of the system description notes the policy).
- Until the app is deployed with this change, `record-video` against the deployed site gets the old view (the parameter is ignored) and clicks the YouTube button as before.
- A visitor who opens an address with `record=1` cannot change the source or the repeat mode until the parameter is removed.

## Alternatives

- **A setting in the browser storage.** The recorder would write it as it writes the mixer levels. An address can also be opened by hand, in OBS's browser source (ADR-0033), and shows what state the view is in.
- **Hiding the transport bar and the practice plan as well.** The owner asked to keep the BPM; the plan shows where in the song the video is.
- **Starting at bar 1 in record mode.** It would overwrite the stored place of a song that is being practised. The recorder's fresh profile starts at bar 1 anyway.
