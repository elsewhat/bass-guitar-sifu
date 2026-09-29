# Song inbox

Drop new Guitar Pro files here, named `Artist-Title-MM-DD-YYYY.gp` (the date is when the transcription was made or downloaded). If you have an MP3 rendered from the same transcription, drop it next to it as `Artist-Title-MM-DD-YYYY.mp3`; it becomes the song's Music source (ADR-0022). Never put a commercial recording here (ADR-0011).

Then run `/preprocess-song` in Claude Code (ADR-0015). The skill:

1. inspects the file,
2. moves it to `songs/<slug>/score.gp` (and the MP3 to `songs/<slug>/audio.mp3`, measuring its lead-in),
3. writes `songs/<slug>/song.yaml` (metadata, named chunks, YouTube id, Music offset, fingering overrides),
4. regenerates `public/data/`.

Processed files leave this folder, so anything here is still waiting to be added.

Waiting:

- `Motorpsycho-Vortex Surfer-09-29-2026.gp` / `.mp3`: a retranscription (236 bars) that differs from `songs/vortex-surfer` (243 bars, the acceptance fixture). On hold by the owner.
- `Rage Against the Machine-Freedom-09-23-2026.gp` / `.mp3`: the score uses repeat signs, which the importer does not support yet.
