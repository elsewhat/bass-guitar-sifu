# ADR-0010: Practice progress in the browser

Status: Accepted
Date: 2026-09-28

## Context

No backend (ADR-0001). Progress per song: current chunk, passes, tempo, completed chunks with tempo, last practised. One main user, possibly on two machines.

## Decision

- `localStorage` with versioned keys: `bass-trainer:v1:<slug>` per song and `bass-trainer:v1:settings`.
- All access wrapped in try/catch; the app works with empty storage.
- Export and import of all progress as a JSON file from a settings dialog.

## Consequences

- Progress does not sync between devices automatically.
- A future sync option (for example a GitHub Gist through the owner's token, or Cloudflare KV behind Access) can be added behind the same storage interface.
