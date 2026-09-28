// npm run build:songs [-- --only <slug>] [-- --check]
// songs/<slug>/{score.gp,song.yaml} → public/data/{catalog.json,songs/<slug>.json} (ADR-0004, ADR-0014).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { CatalogEntry } from '../src/core/model';
import { buildSongFromDir } from './lib/build';
import { stableJson } from './lib/stable-json';

const { values } = parseArgs({ options: { only: { type: 'string' }, check: { type: 'boolean', default: false } } });

const SONGS = 'songs';
const OUT = join('public', 'data');
const OUT_SONGS = join(OUT, 'songs');

const slugs = existsSync(SONGS)
  ? readdirSync(SONGS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(SONGS, d.name, 'song.yaml')))
      .map((d) => d.name)
      .sort()
  : [];
if (values.only && !slugs.includes(values.only)) {
  console.error(`No songs/${values.only}/song.yaml`);
  process.exit(1);
}

const outputs = new Map<string, string>(); // path → content
const catalog: CatalogEntry[] = [];
let failed = false;

for (const slug of slugs) {
  if (values.only && slug !== values.only) {
    // Keep the other songs' catalog entries from the committed catalog.
    const previous = readCatalog().find((c) => c.slug === slug);
    if (previous) catalog.push(previous);
    continue;
  }
  try {
    const { song, catalog: entry, warnings } = buildSongFromDir(join(SONGS, slug), slug);
    for (const w of warnings) console.warn(`  ⚠ ${slug}: ${w}`);
    outputs.set(join(OUT_SONGS, `${slug}.json`), stableJson(song));
    catalog.push(entry);
    console.log(`✓ ${slug}: ${song.bars.length} bars, ${song.stats.noteCount} notes, ${song.chunks.length} chunks`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${slug}: ${(err as Error).message}`);
  }
}
if (failed) process.exit(1);

catalog.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
outputs.set(join(OUT, 'catalog.json'), stableJson(catalog));

if (values.check) {
  const problems: string[] = [];
  for (const [path, content] of outputs) {
    if (!existsSync(path)) problems.push(`missing ${path}`);
    else if (readFileSync(path, 'utf8').replace(/\r\n/g, '\n') !== content) problems.push(`stale ${path}`);
  }
  for (const dir of [OUT_SONGS]) {
    if (values.only || !existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!slugs.includes(f.replace(/\.json$/, ''))) problems.push(`orphan ${join(dir, f)}`);
    }
  }
  if (problems.length) {
    console.error(`Generated data is out of date. Run \`npm run build:songs\` and commit public/data.\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`public/data is up to date (${slugs.length} songs).`);
} else {
  for (const dir of [OUT_SONGS]) {
    mkdirSync(dir, { recursive: true });
    if (values.only) continue;
    for (const f of readdirSync(dir)) {
      if (!slugs.includes(f.replace(/\.json$/, ''))) rmSync(join(dir, f));
    }
  }
  for (const [path, content] of outputs) writeFileSync(path, content);
  console.log(`Wrote ${outputs.size} files to ${OUT}.`);
}

function readCatalog(): CatalogEntry[] {
  const path = join(OUT, 'catalog.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as CatalogEntry[]) : [];
}
