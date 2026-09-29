# ADR-0016: Playback sources for version 1 and sync authoring

Status: Accepted, amended by ADR-0022 (Music, a fourth source)
Date: 2026-09-28
Amends: ADR-0008.

## Context

Spotify's Web Playback SDK needs Premium and OAuth, and it has no playback-rate control. Since 2026, Development Mode also limits an app to five authorised users. Tempo control is central to the app. YouTube needs a sync map per recording.

## Decision

- Version 1 sources: **Count**, **YouTube** and **Synth**. The source switch shows these three. Spotify is deferred and removed from the sidecar schema.
- Sync anchors are authored with an in-app **tap editor**, available in `dev` and `preview` builds behind `?sync=1`. The owner plays the video and taps on bar downbeats. The editor shows the anchors and copies a YAML `sync:` block to the clipboard, which is pasted into `song.yaml` or handed to the skill. The app never writes to the repository.

## Consequences

- There are no OAuth flows or client secrets anywhere.
- Adding Spotify later means a new ADR and schema field.
