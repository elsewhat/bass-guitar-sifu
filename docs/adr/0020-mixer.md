# ADR-0020: Mixer per source

Status: Proposed
Date: 2026-09-29
Amends: ADR-0008 (sources), ADR-0019 (Synth track mix).

## Context

Each source has its own sound, and the player needs to balance it against the bass they are playing:

- **Count** plays a click tone today and will play recorded voice samples (`one`, `and`, …). `CountClock` currently plays the sample when it exists and the tone otherwise, and connects both straight to `ctx.destination`.
- **Synth** is alphaTab's player, which generates MIDI for every track of the `.gp` file. ADR-0019 added `SynthMix` (`bass`, `band`, `backing`) with no switch in the UI.
- **YouTube** (step 6) can only be controlled through the IFrame API: `setVolume(0–100)`, `mute()`, `unMute()`.

alphaTab exposes `api.masterVolume` (0–1) and, per track, `changeTrackVolume(tracks, 0–1)`, `changeTrackMute` and `changeTrackSolo`.

## Decision

**UI.** An equalizer icon (three bars) in the top-right corner of the video cell opens the **Mixer**, a modal with the same shell as the song library: dim backdrop, centred panel (680 px wide, radius 20), close button, closes on backdrop click and `Esc`. Design: `design/artboards/Main.dc.html` and `MixerOverlay.dc.html`.

- **Master** row at the top: mute button, slider 0–100 %, value. Applies to every source.
- **Source tabs** `YouTube · Synth · Count`. The tab of the active source is selected when the mixer opens and has a green dot; the other tabs can be adjusted in advance.
- One **channel row** per channel: name and short description, mute button, solo button (Synth only), slider 0–100 %, value (`80%`, `Muted`, or `Off` when another track is soloed).
- Channels per source:
  - YouTube: `Video`.
  - Synth: one row per track of the `.gp` file, named from the track name (for `Artist | Instrument | Role` names, the last part is the title and the rest the description). The bass track is marked "Your part". **Quick mix** buttons `Bass only`, `Full band` and `Backing` set solo and mute for all tracks and show as selected when the current state matches.
  - Count: `Click` (tone on every count, accent on beat 1) and `Voice` (recorded samples). Both can sound at the same time.
- Muting is one click on the round speaker button; a muted row keeps its slider value, which comes back on unmute.

**Audio.**

- Count: `CountClock` gets a small graph `click gain → count bus`, `voice gain → count bus`, `count bus → master gain → destination`. The tone is always scheduled on the click channel and the sample on the voice channel; each channel is skipped when its effective gain is 0. While the voice samples are missing, the Voice row shows "No samples" and is disabled.
- Synth: effective track volume = track volume × Synth gain, applied with `changeTrackVolume`; mute and solo with `changeTrackMute` / `changeTrackSolo`; master with `api.masterVolume`. `SynthMix` from ADR-0019 becomes the three Quick mix presets.
- YouTube: `setVolume(round(master × video × 100))`, and `mute()` when either is muted.
- The mixer never changes timing or the loop; it only reads and writes volumes.

**State and storage.**

- `src/playback/mixer.ts` holds the pure model: channel ids, defaults, the effective-gain function (master × channel, 0 when muted or silenced by solo) and the preset functions. Unit tests cover solo, mute and presets.
- Store: `mixer` in the session store. Master, YouTube and Count values are global. Synth track settings are per song, keyed by track index and name, since track lists differ per `.gp` file.
- Persisted in `localStorage` (ADR-0010): `bass-trainer:v1:settings.mixer` for global values and `bass-trainer:v1:<slug>.synthTracks` per song.
- Defaults: master 80 %, Video 100 %, Click 70 %, Voice 100 %, Synth tracks 80 % with the bass track soloed (the ADR-0019 default "bass only").

## Consequences

- ADR-0019's open question "where the mix switch goes" is answered by the Quick mix buttons.
- `CountClock` changes from "sample or tone" to "tone and sample on separate channels"; with both at default levels the count is louder than today, hence the click default of 70 %.
- A song with many tracks (Creep and Black Hole Sun have 8) fits in the panel; the channel list scrolls above 8 rows.
- Volume changes on the Synth take effect on alphaTab's next audio buffer; there is no audible re-seek.

## Alternatives considered

- **Mixer controls inline in the transport bar.** The bar is already full at 619 px wide, and per-track controls do not fit.
- **One volume slider per source without channels.** It does not allow practising against the band without the bass, or muting the click while keeping the voice.

## Implementation notes (2026-09-29)

- **Metronome.** The owner renamed the Count source to "Metronome" in the UI (source switch and mixer tab). The code keeps the id `count` and `CountClock`.
- **Model.** `src/playback/mixer.ts`: `Channel` (volume 0–100, muted), `TrackChannel` (+ solo), `GlobalMix` (master, video, click, voice), `effectiveGain`, `trackSilenced` / `trackGain` (mute wins over solo), `applyQuickMix` / `activeQuickMix`, `trackLabel`. Tests in `mixer.test.ts` and `src/state/storage.test.ts`. `src/playback/synth-mix.ts` is removed; its three mixes are the `QuickMix` presets.
- **Track list.** The song JSON has a new `tracks` field with every track name of the `.gp` file (from `scripts/lib/gp-import.ts`), so the Synth tab can be filled before the Synth has loaded. Stored track settings are matched by index and name; tracks without a match get 80 %, and with no match at all the default "Bass only" applies.
- **Synth gain.** There is no separate Synth source level in the UI, so the Synth gets the master through `api.masterVolume` and each track's volume (0–1, where 1 is the file's own level) through `changeTrackVolume`; mute and solo through `changeTrackMute` / `changeTrackSolo`. They apply once the player is ready and again after a MIDI reload.
- **Metronome audio.** `CountClock` builds `click gain → master gain → destination` and `voice gain → master gain`, changes levels with a 15 ms time constant, and skips scheduling a channel whose gain is 0. `countSamplesAvailable()` checks `audio/count/one.wav` once at start-up for the Voice row.
- **Storage.** `bass-trainer:v1:settings.mixer` and `bass-trainer:v1:<slug>.synthTracks` as decided, through `src/state/storage.ts`.
- **YouTube.** The Video channel is stored but not applied until the YouTube source exists.
