# Bass Trainer Sifu

A practice tool for the bass parts of real songs. It is inspired by BassBuzz (structured practice in small steps) and Songsterr (scrolling tab synced to a recording).

- Songs are practised in chunks of a few bars that loop and then advance.
- Tempo is adjustable. Playback comes from a YouTube video, a synthesised rendition or a spoken count.
- A silent visual metronome shows when to pluck, which fret, and for how long.
- Every note has a recommended fretting finger, planned so the hand stays in position.

**Live:** https://elsewhat.github.io/bass-guitar-sifu/

## Documentation

- [System description](docs/system-description.md): screens, behaviour, data model, algorithms, milestones
- [Architecture decisions](docs/adr/README.md)
- [Design reference](design/README.md): artboards and tokens exported from Claude Design; `design/claude_design_export.pdf` is an overview

## Songs

Each song lives in `songs/<slug>/` as `score.gp` (Guitar Pro, source of truth for notes) plus `song.yaml` (metadata, practice chunks, YouTube id and sync anchors, fingering overrides).

To add a song, drop `Artist-Title-MM-DD-YYYY.gp` into [`music/`](music/README.md) and run `/preprocess-song` in Claude Code.

## Development

```bash
npm install
npm run dev
```

See [CLAUDE.md](CLAUDE.md) for commands and rules.
