# Bass Trainer

Practice tool for bass parts of real songs. See `docs/system-description.md` for the full description and `docs/adr/` for architecture decisions.

## Starting with Claude Code

1. Create the repository from this folder and commit it.
2. Export the two artboards as PNG into `design/screens/` (see `design/README.md`).
3. Decide ADR-0001 (hosting and access control) or leave deployment disabled.
4. Start Claude Code in the repository root. `CLAUDE.md` is loaded automatically. A suitable first prompt:

   > Read CLAUDE.md, docs/system-description.md and all ADRs. Then implement milestone 1 and 2 from section 12 of the system description. Stop after milestone 2 and summarise what the song pipeline produced for the six songs, compared with the catalogue table in section 11.

## Songs

| Folder | Song |
|---|---|
| `songs/vortex-surfer` | Motorpsycho · Vortex Surfer |
| `songs/the-wheel` | Motorpsycho · The Wheel |
| `songs/un-chien-d-espace` | Motorpsycho · Un Chien d'Espace |
| `songs/wearing-yr-smell` | Motorpsycho · wearing yr smell |
| `songs/creep` | Radiohead · Creep |
| `songs/black-hole-sun` | Soundgarden · Black Hole Sun |

Add a song: create `songs/<slug>/` with `score.gp` and a `song.json` (copy one of the existing sidecars).
