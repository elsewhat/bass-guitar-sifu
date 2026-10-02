# ADR-0026: Album covers in the header

Status: Proposed (implemented, awaiting owner review)
Date: 2026-10-03
Amends: ADR-0011 (album artwork is stored and published with the song), ADR-0013 (new `cover` key in `song.yaml`).

## Context

- The header has had an artwork placeholder (a music note in a 64 px square) since the first design (system description §3.1). The owner asked for the album art of every song in that corner (2026-10-03).
- The app is static files with no backend (ADR-0012), so the image must either be stored with the song or loaded from a third party at runtime.
- Album artwork is copyrighted. ADR-0011 only covers scores, lyrics and audio. The owner already publishes the `.gp` files, the rendered MP3s (ADR-0022) and the lyrics (ADR-0024).
- The iTunes Search API is free, needs no key, and returns artwork in any size up to 3000 px for an album (collection) id. Its search often ranks singles, EPs, live albums and compilations above the original album, so the album must be chosen, not taken from the first hit.

## Decision

- **Stored with the song.** Each song has `songs/<slug>/cover.jpg`, 300 × 300 px (12–45 kB), served and copied by the `song-scores` Vite plugin at `data/covers/<slug>.jpg`, like the score and the MP3. Songs on the same album have identical files; git stores the blob once.
- **Sidecar.** `cover: { album: "<album title>", itunesId: <collection id> }` in `song.yaml`. `album` is required and is the image's alt text and tooltip. `itunesId` records where the image came from, so it can be fetched again at another size.
- **Which album.** The original release of the recording the tab follows: the studio album for studio versions (Bleach, Nevermind, Superunknown, …), the live album for live versions (*The Man Who Sold the World*: MTV Unplugged in New York). When the store only has a reissue (Bleach Deluxe Edition, No Need to Argue 2025 remaster), use the reissue's artwork and write the original album title.
- **Tool.** `npm run fetch-cover -- <slug>` lists the albums on iTunes that contain the song; `npm run fetch-cover -- <slug> --id <collectionId>` downloads the cover and prints the `cover:` line. The `preprocess-song` skill runs it as step 4c.
- **Build.** `build:songs` adds `cover: { url, album }` to the song JSON when `cover` is set. It fails if `cover` is set and `cover.jpg` is missing, and warns when a song has no cover or a `cover.jpg` without `cover`.
- **Header.** The 64 px square shows the cover (`object-cover`, `radius-standard`); without one it keeps the music-note placeholder.

## Consequences

- All 21 songs have a cover; about 660 kB of images (480 kB of distinct files), published on Pages like the other song files.
- Covers are not used in the song library overlay yet; the cards in `SelectorOverlay.dc.html` have no artwork. Adding them later only needs a `cover` flag in the catalogue.
- Fetching needs network access during intake only. The app makes no third-party requests for covers.

## Alternatives

- **Hotlink Apple's artwork URL at runtime.** Keeps images out of the repository, but every page load would call Apple's CDN (the viewer's IP leaves the site), the image breaks if the URL changes, and it does not work offline. Rejected for the same reasons the app ships its own fonts and soundfont.
- **YouTube thumbnail** (`i.ytimg.com/vi/<id>/…`). Free with the existing video ids, but only "Topic" uploads show the album art; official videos show a video frame, often with letterboxing. Rejected.
- **Embedded artwork in the `.gp` file.** Guitar Pro files carry no artwork.
