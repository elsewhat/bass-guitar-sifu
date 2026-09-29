# ADR-0015: Song intake through the `preprocess-song` agent skill

Status: Accepted, amended by ADR-0022 (the paired MP3 and its offset)
Date: 2026-09-28
Amends: ADR-0006 (chunk naming heuristic).

## Context

Adding a song needs judgment that code does badly:

- choosing the bass track when names are odd
- cleaning up title and artist
- spotting a half-time notation
- naming chunks musically ("Climb", "E pedal")
- finding the official video
- sanity-checking the fingering

A Claude Code agent skill can do this in the repository, using deterministic scripts for the parts that must be exact.

## Decision

- **Inbox.** New files are dropped into `music/` as `Artist-Title-MM-DD-YYYY.gp`.
- **Skill.** `.claude/skills/preprocess-song/SKILL.md` runs locally in Claude Code with `/preprocess-song [file]`. Its steps:
  1. Run `npm run inspect-song -- <file>`. It reports the tracks, tuning, tempo map, time signatures, section markers, tacet ranges, bar signatures, a draft chunk split, and fingering hot spots.
  2. Choose the bass track, slug, title, artist and tuning name. Check whether the tempo looks like half-time.
  3. Run `git mv` to move the file to `songs/<slug>/score.gp`.
  4. Write `song.yaml` with named chunks, the `source` record and review notes.
  5. Search the web for the official YouTube video and set `media.youtube.videoId`. Sync anchors are left for the tap editor (ADR-0016).
  6. Run `npm run build:songs -- --only <slug>`.
  7. Review the fingering output. Add `fingeringOverrides` where the solver is awkward, then rebuild.
  8. Summarise what it decided and what the owner should check.
- **Chunking.** Code provides tacet detection, section markers, bar signatures, repeat detection and a draft split into phrases of 2–8 bars. The agent decides the final boundaries and names. The build **requires** `chunks` in `song.yaml` and does not invent names.
- **Fixture.** The Vortex Surfer chunks come from `reference/vortex-surfer-chunks.json`.
- **Fingering.** Fingering stays a deterministic solver at build time (ADR-0007). The agent only adds overrides.

## Consequences

- Adding a song is: drop the file, run the skill, review the diff, commit.
- The ADR-0006 naming heuristic (`Riff A`, `<name> ×2`) is no longer implemented. The draft split is guidance for the agent, not output.
- Chunk lists are stable because they are frozen in the sidecar.
