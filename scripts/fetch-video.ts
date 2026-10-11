// npm run fetch-video -- <slug> [--write] [--video <videoId>] [--song <songId>] [--revision <revisionId>]
// The YouTube video and its sync for a song (ADR-0028): the video Songsterr plays with the tab, and
// Songsterr's point per bar as sync anchors. Without --write it only reports; with --write it
// replaces `media.youtube` in songs/<slug>/song.yaml (run npm run build:songs afterwards).
//   --video     another video of the tab instead of the default one (an id from "Other videos")
//   --song      the Songsterr song id, when the search picks the wrong tab
//   --revision  the tab revision, when the one current on source.date is not the .gp's
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { tempoLookup } from '../src/core/timing';
import { importBassTrack, loadScore, pickBassTrack } from './lib/gp-import';
import { loadSidecar, parseSidecar } from './lib/sidecar';
import { pickRevision, pickSong, revisions, searchSongs, songMeta, videos, type SongsterrVideo } from './lib/songsterr';
import { alignPoints, clock, replaceYoutube, youtubeYaml } from './lib/video-sync';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { write: { type: 'boolean' }, video: { type: 'string' }, song: { type: 'string' }, revision: { type: 'string' } },
});
const slug = positionals[0];
const dir = join('songs', slug ?? '');
const yamlPath = join(dir, 'song.yaml');
if (!slug || !existsSync(yamlPath)) {
  console.error('Usage: npm run fetch-video -- <slug> [--write] [--video <videoId>] [--song <songId>] [--revision <revisionId>]');
  process.exit(1);
}

const sidecar = loadSidecar(yamlPath);
const score = loadScore(join(dir, 'score.gp'));
const { song: imported } = importBassTrack(score, pickBassTrack(score, sidecar.bassTrack));
const tempo = tempoLookup(imported.tempoMap, imported.bars);
const lastBar = imported.bars[imported.bars.length - 1]!;
const starts = [...imported.bars.map((b) => tempo.secondsAt(b.startTick)), tempo.secondsAt(lastBar.startTick + lastBar.durTicks)];

// The tab: recorded in song.yaml, given, or found by artist, title and track names.
const known = sidecar.media?.youtube?.songsterr;
let songId = Number(values.song ?? known?.songId ?? 0);
if (songId) {
  const meta = await songMeta(songId);
  console.log(`Songsterr: ${meta.artist} – ${meta.title} (song ${songId})`);
} else {
  const found = await searchSongs(`${sidecar.title} ${sidecar.artist}`);
  const pick = pickSong(found, sidecar.artist, sidecar.title, imported.tracks);
  if (!pick) {
    console.error(`No Songsterr tab by ${sidecar.artist} found for "${sidecar.title}". Found: ${found.map((s) => `${s.songId} ${s.artist} – ${s.title}`).join('; ') || 'nothing'}`);
    console.error('Give the tab with --song <songId> (the number after "-s" in its Songsterr address).');
    process.exit(1);
  }
  songId = pick.song.songId;
  console.log(`Songsterr: ${pick.song.artist} – ${pick.song.title} (song ${songId}), ${pick.shared} of ${imported.tracks.length} track names as in the .gp`);
  if (pick.shared === 0) console.log('  No track name matches: check that this is the tab the .gp came from, or give --song <songId>.');
}

// The revision the .gp was exported from: its points fit the file's bars best.
const knownRevision = values.song ? undefined : known?.revisionId; // another tab has other revisions
let revisionId = Number(values.revision ?? knownRevision ?? 0);
if (!revisionId) {
  const revision = pickRevision(await revisions(songId), sidecar.source.date);
  if (!revision) throw new Error(`Songsterr lists no revision for song ${songId}`);
  revisionId = revision.revisionId;
  console.log(`Revision ${revisionId} from ${revision.createdAt.slice(0, 10)} (the .gp is dated ${sidecar.source.date ?? 'unknown'})`);
} else console.log(`Revision ${revisionId}`);

const list = await videos(songId, revisionId);
const main = list.find((v) => v.feature === null);
const video: SongsterrVideo | undefined = values.video ? list.find((v) => v.videoId === values.video) : (main ?? list.find((v) => v.feature === 'alternative'));
if (!video) {
  console.error(values.video ? `Video ${values.video} is not among this tab's ${list.length} videos.` : 'Songsterr has no synced video for this tab.');
  process.exit(1);
}

const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video.videoId}`)}`);
const info = oembed.ok ? ((await oembed.json()) as { title: string; author_name: string }) : null;
console.log(`Video: ${video.videoId} (${video.feature ?? 'default'})${info ? ` · "${info.title}" by ${info.author_name}` : ''}`);
if (!info) console.log(`  YouTube answers ${oembed.status}: the video is gone or may not be embedded. Choose another with --video.`);

const aligned = alignPoints(starts, video.points);
const first = aligned.anchors[0];
console.log(
  `Sync: ${aligned.anchors.length} anchors for ${imported.bars.length} bars · bar ${first?.bar ?? '?'} at ${first ? clock(first.ms) : '?'} · ` +
    `recording at ×${aligned.ratio.toFixed(3)} of the score's bar lengths · up to ${aligned.drift.seconds.toFixed(2)} s from the tempo map (bar ${aligned.drift.bar})`,
);
for (const note of aligned.notes) console.log(`  - ${note}`);

const others = list.filter((v) => v !== video);
if (others.length) {
  const counts = new Map<string, number>();
  for (const v of others) counts.set(v.feature ?? 'default', (counts.get(v.feature ?? 'default') ?? 0) + 1);
  console.log(`Other videos: ${[...counts].map(([f, n]) => `${n} ${f}`).join(', ')}. The first ones, for --video:`);
  for (const v of others.slice(0, 8)) console.log(`  ${v.videoId}  ${(v.feature ?? 'default').padEnd(11)} ${v.points.length} points, bar 1 at ${clock(v.points[0]! * 1000)}`);
}

if (!aligned.anchors.length) throw new Error('The video has no usable points');
if (values.write) {
  const text = replaceYoutube(readFileSync(yamlPath, 'utf8'), youtubeYaml(video.videoId, { songId, revisionId }, aligned.anchors));
  parseSidecar(text, yamlPath); // never write a sidecar the build would reject
  writeFileSync(yamlPath, text);
  console.log(`${yamlPath}: media.youtube written. Run npm run build:songs -- --only ${slug}`);
} else console.log('Nothing written; add --write to put this into song.yaml.');
