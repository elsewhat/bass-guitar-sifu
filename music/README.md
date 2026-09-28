# Song inbox

Drop new Guitar Pro files here, named `Artist-Title-MM-DD-YYYY.gp` (the date is when the transcription was made or downloaded).

Then run `/preprocess-song` in Claude Code (ADR-0015). The skill:

1. inspects the file,
2. moves it to `songs/<slug>/score.gp`,
3. writes `songs/<slug>/song.yaml` (metadata, named chunks, YouTube id, fingering overrides),
4. regenerates `public/data/`.

Processed files leave this folder, so anything here is still waiting to be added.
