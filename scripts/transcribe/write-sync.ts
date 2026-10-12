// Put measured anchors into media.youtube of a song.yaml, in the layout fetch-video writes.
//   npx tsx scripts/transcribe/write-sync.ts <song.yaml> <anchors.json> <videoId> [songId revisionId]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseSidecar } from '../lib/sidecar';
import { replaceYoutube, youtubeYaml } from '../lib/video-sync';

const [yamlPath, anchorsPath, videoId, songId, revisionId] = process.argv.slice(2);
const anchors = (JSON.parse(readFileSync(anchorsPath!, 'utf8')) as { anchors: { bar: number; ms: number }[] }).anchors;
const songsterr = songId && revisionId ? { songId: Number(songId), revisionId: Number(revisionId) } : null;
const text = replaceYoutube(readFileSync(yamlPath!, 'utf8'), youtubeYaml(videoId!, songsterr, anchors));
parseSidecar(text, yamlPath!);
writeFileSync(yamlPath!, text);
console.log(`${yamlPath}: ${anchors.length} anchors written`);
