// Finds a Guitar Pro file by its original inbox name, whether it is still in music/ or has
// been moved to songs/<slug>/score.gp by the preprocess-song skill (source.file in song.yaml).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function locateGp(originalName: string, root = '.'): string {
  const inbox = join(root, 'music', originalName);
  if (existsSync(inbox)) return inbox;
  const songs = join(root, 'songs');
  if (existsSync(songs)) {
    for (const slug of readdirSync(songs)) {
      const yamlPath = join(songs, slug, 'song.yaml');
      if (!existsSync(yamlPath)) continue;
      const sidecar = parse(readFileSync(yamlPath, 'utf8')) as { source?: { file?: string } };
      if (sidecar.source?.file === originalName) return join(songs, slug, 'score.gp');
    }
  }
  throw new Error(`${originalName} is neither in music/ nor recorded as source.file in songs/*/song.yaml`);
}
