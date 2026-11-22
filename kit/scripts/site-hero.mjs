// Bundles the landing hero (site/src/hero.ts: BASECAMP's ops on the skeleton, in-memory store) into
// site/assets/hero.js. `--prerender <dir>` also writes a Node build to <dir> and prints the settled
// lake-scene cards as JSON, which the landing uses as its no-JS markup.
// `--check` rebuilds into a temp dir and fails if the committed site/assets/hero.js differs (CI freshness gate).
// Run: node kit/scripts/site-hero.mjs [--check | --prerender <dir>]
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const entry = resolve('site/src/hero.ts');
const quiet = { logLevel: 'warn', configFile: false };
const check = process.argv.includes('--check');
const outDir = check ? mkdtempSync(join(tmpdir(), 'limbo-hero-')) : resolve('site/assets');
await build({
  ...quiet,
  build: {
    lib: { entry, formats: ['iife'], name: 'LimboHero', fileName: () => 'hero.js' },
    outDir,
    emptyOutDir: false,
    minify: true,
    target: 'es2020',
  },
});
if (check) {
  const same = readFileSync(join(outDir, 'hero.js')).equals(readFileSync(resolve('site/assets/hero.js')));
  rmSync(outDir, { recursive: true, force: true });
  console.log(same ? 'OK site/assets/hero.js matches site/src/hero.ts' : 'FAIL site/assets/hero.js is stale: run node kit/scripts/site-hero.mjs');
  process.exit(same ? 0 : 1);
}
const i = process.argv.indexOf('--prerender');
if (i > 0) {
  const dir = resolve(process.argv[i + 1]);
  await build({
    ...quiet,
    build: { lib: { entry, formats: ['es'], fileName: () => 'hero.node.mjs' }, outDir: dir, emptyOutDir: false, minify: false, target: 'node22' },
  });
  const mod = await import(pathToFileURL(resolve(dir, 'hero.node.mjs')).href);
  process.stdout.write(JSON.stringify(await mod.prerender()));
}
