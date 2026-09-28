// Serves songs/<slug>/score.gp as <base>data/scores/<slug>.gp in dev and emits it into the
// build, so the app can load the Guitar Pro file with alphaTab (ADR-0017) without a second
// committed copy in public/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const SONGS = 'songs';
const ROUTE = /\/data\/scores\/([a-z0-9-]+)\.gp$/;

function scoreFiles(): { slug: string; path: string }[] {
  if (!existsSync(SONGS)) return [];
  return readdirSync(SONGS)
    .map((slug) => ({ slug, path: join(SONGS, slug, 'score.gp') }))
    .filter((s) => existsSync(s.path));
}

export function songScores(): Plugin {
  return {
    name: 'song-scores',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const slug = req.url?.split('?')[0]?.match(ROUTE)?.[1];
        const path = slug && join(SONGS, slug, 'score.gp');
        if (!path || !existsSync(path)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const { slug, path } of scoreFiles()) {
        this.emitFile({ type: 'asset', fileName: `data/scores/${slug}.gp`, source: readFileSync(path) });
      }
    },
  };
}
