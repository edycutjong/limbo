// Bundles the landing hero (site/src/hero.ts: BASECAMP's ops on the skeleton, in-memory store) into
// site/assets/hero.js. `--prerender <dir>` also writes a Node build to <dir> and prints the settled
// lake-scene cards as JSON, which the landing uses as its no-JS markup.
// Run: node kit/scripts/site-hero.mjs [--prerender <dir>]
import { build } from 'vite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = resolve('site/src/hero.ts');
const quiet = { logLevel: 'warn', configFile: false };
await build({
  ...quiet,
  build: {
    lib: { entry, formats: ['iife'], name: 'LimboHero', fileName: () => 'hero.js' },
    outDir: resolve('site/assets'),
    emptyOutDir: false,
    minify: true,
    target: 'es2020',
  },
});
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
