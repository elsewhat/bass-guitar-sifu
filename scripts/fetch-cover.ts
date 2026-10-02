// npm run fetch-cover -- <slug> [--id <collectionId>] [--term <search text>]
// Album cover for the header (ADR-0026). Without --id, lists the albums on the iTunes Search API
// that contain the song, so the original studio album can be chosen. With --id, downloads that
// album's artwork as songs/<slug>/cover.jpg (300 × 300) and prints the `cover:` line for song.yaml.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadSidecar } from './lib/sidecar';

const SIZE = 300;

interface ItunesItem {
  wrapperType: string;
  collectionId: number;
  collectionName: string;
  artistName: string;
  trackName?: string;
  trackCount?: number;
  releaseDate?: string;
  artworkUrl100?: string;
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { id: { type: 'string' }, term: { type: 'string' } } });
const slug = positionals[0];
if (!slug || !existsSync(join('songs', slug, 'song.yaml'))) {
  console.error('Usage: npm run fetch-cover -- <slug> [--id <collectionId>] [--term <search text>]');
  process.exit(1);
}
const sidecar = loadSidecar(join('songs', slug, 'song.yaml'));

async function itunes(path: string): Promise<ItunesItem[]> {
  const res = await fetch(`https://itunes.apple.com/${path}`);
  if (!res.ok) throw new Error(`iTunes API ${res.status} for ${path}`);
  return ((await res.json()) as { results: ItunesItem[] }).results;
}

const year = (item: ItunesItem) => item.releaseDate?.slice(0, 4) ?? '????';

if (values.id) {
  const album = (await itunes(`lookup?id=${encodeURIComponent(values.id)}&entity=album`)).find((r) => r.wrapperType === 'collection');
  if (!album?.artworkUrl100) throw new Error(`No album with artwork for collection id ${values.id}`);
  const url = album.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${SIZE}x${SIZE}bb.jpg`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Artwork ${res.status}: ${url}`);
  const file = join('songs', slug, 'cover.jpg');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${file}: ${album.collectionName} (${album.artistName}, ${year(album)})`);
  console.log(`cover: { album: ${JSON.stringify(album.collectionName)}, itunesId: ${album.collectionId} }`);
} else {
  const term = values.term ?? `${sidecar.artist} ${sidecar.title}`;
  const tracks = await itunes(`search?term=${encodeURIComponent(term)}&entity=song&limit=50`);
  const seen = new Set<number>();
  console.log(`Albums with "${sidecar.title}" by ${sidecar.artist} (search: ${term}):`);
  for (const t of tracks) {
    if (seen.has(t.collectionId) || t.artistName.toLowerCase() !== sidecar.artist.toLowerCase()) continue;
    seen.add(t.collectionId);
    console.log(`  ${String(t.collectionId).padEnd(11)} ${year(t)}  ${String(t.trackCount ?? '?').padStart(3)} tracks  ${t.collectionName}  ·  ${t.trackName}`);
  }
  if (seen.size === 0) console.log('  none; try --term with other words');
}
