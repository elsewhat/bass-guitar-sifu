# ADR-0012: Public repository and public GitHub Pages

Status: Accepted, amended by ADR-0022 (rendered MP3s are published with the `.gp` files) and ADR-0024 (lyrics are published)
Date: 2026-09-28
Supersedes: ADR-0001. Amends: ADR-0011.

## Context

ADR-0001 left hosting open because the design assumed access control was needed. The owner has since decided that access control does not matter. The app is a personal practice tool, and the owner wants the simplest distribution.

## Decision

- The repository `elsewhat/bass-guitar-sifu` is public.
- The site is deployed by GitHub Actions to GitHub Pages at `https://elsewhat.github.io/bass-guitar-sifu/`, using `actions/deploy-pages` with Pages source "GitHub Actions".
- Vite `base` comes from the `BASE_PATH` environment variable. The workflow sets it to `/bass-guitar-sifu/`, and locally it defaults to `/`. All data is fetched relative to `import.meta.env.BASE_URL`.
- There is no login, allow-list or access control of any kind.

## Consequences

- The Guitar Pro files (`songs/*/score.gp`) and the generated song data are publicly readable. This changes ADR-0011: third-party transcriptions are published. The owner accepts the risk that a file may have to be removed after a takedown request.
- ADR-0011's other rules are unchanged: no lyrics text and no downloaded audio or video in the repository. *Lyrics changed by ADR-0024 (2026-09-30): they are stored and published with the song.*
- No GitHub Pro or Enterprise plan is needed.
- The YouTube embed origin is `https://elsewhat.github.io`.
