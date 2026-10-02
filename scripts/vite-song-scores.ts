// Serves songs/<slug>/score.gp as <base>data/scores/<slug>.gp, songs/<slug>/audio.mp3 as
// <base>data/audio/<slug>.mp3 and songs/<slug>/cover.jpg as <base>data/covers/<slug>.jpg in dev,
// and copies them into the build, so the app can load the Guitar Pro file with alphaTab
// (ADR-0017), the Music source's MP3 (ADR-0022) and the album cover (ADR-0026) without a second
// committed copy in public/.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const SONGS = 'songs';
const ASSETS = [
  { route: /\/data\/scores\/([a-z0-9-]+)\.gp$/, file: 'score.gp', out: (slug: string) => `data/scores/${slug}.gp`, type: 'application/octet-stream' },
  { route: /\/data\/audio\/([a-z0-9-]+)\.mp3$/, file: 'audio.mp3', out: (slug: string) => `data/audio/${slug}.mp3`, type: 'audio/mpeg' },
  { route: /\/data\/covers\/([a-z0-9-]+)\.jpg$/, file: 'cover.jpg', out: (slug: string) => `data/covers/${slug}.jpg`, type: 'image/jpeg' },
];

export function songScores(): Plugin {
  let outDir = 'dist';
  return {
    name: 'song-scores',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        for (const asset of ASSETS) {
          const slug = url.match(asset.route)?.[1];
          const path = slug && join(SONGS, slug, asset.file);
          if (!path || !existsSync(path)) continue;
          // Byte ranges, so <audio> can seek in a long MP3.
          const size = statSync(path).size;
          const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
          res.setHeader('Content-Type', asset.type);
          res.setHeader('Accept-Ranges', 'bytes');
          if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            if (start >= size || start > end) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${size}`);
              return res.end();
            }
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', end - start + 1);
            return void createReadStream(path, { start, end }).pipe(res);
          }
          res.setHeader('Content-Length', size);
          return void createReadStream(path).pipe(res);
        }
        next();
      });
    },
    // Copied after the bundle is written rather than emitted, to keep the MP3s out of memory.
    writeBundle() {
      if (!existsSync(SONGS)) return;
      for (const slug of readdirSync(SONGS)) {
        for (const asset of ASSETS) {
          const path = join(SONGS, slug, asset.file);
          if (!existsSync(path)) continue;
          const target = join(outDir, asset.out(slug));
          mkdirSync(join(target, '..'), { recursive: true });
          copyFileSync(path, target);
        }
      }
    },
  };
}
