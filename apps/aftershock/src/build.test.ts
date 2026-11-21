import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// Vitest sets NODE_ENV=test and MODE=test; a real production build must not inherit them.
const prodEnv = { ...process.env, NODE_ENV: 'production', MODE: 'production' };

it('pnpm --filter @limbo/aftershock build produces dist/index.html', () => {
  execFileSync('pnpm', ['--filter', '@limbo/aftershock', 'build'], { stdio: 'pipe', env: prodEnv });
  expect(existsSync(resolve(__dirname, '../dist/index.html'))).toBe(true);
}, 120_000);

const dist = resolve(__dirname, '../dist');
const root = resolve(__dirname, '..');

function textOf(dir: string): string {
  return readdirSync(dir)
    .map((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? textOf(p) : readFileSync(p, 'utf8');
    })
    .join('\n');
}

it('the production build contains no dev relay, no window.limbo, no localhost:5175, no https://', () => {
  execFileSync('pnpm', ['--filter', '@limbo/aftershock', 'build'], { stdio: 'pipe', env: prodEnv });
  // Two library error-message strings carry documentation URLs (React and Yjs). They are text in messages,
  // never fetched. Everything else in dist/ must be free of https://, so no CDN font, script or style loads.
  // The generated Workbox runtime (workbox-*.js) has one console.warn message that links https://bit.ly/wb-precache.
  // It is message text in a library file, never fetched; sw.js itself holds no https://.
  const vendorDocs = ['https://react.dev/errors/', 'https://github.com/yjs/yjs/issues/438', 'https://bit.ly/wb-precache'];
  let text = textOf(dist);
  expect(text.length).toBeGreaterThan(1000);
  for (const v of vendorDocs) text = text.split(v).join('');
  for (const banned of ['devrelay', 'DevRelayLink', 'window.limbo', 'localhost:5175', 'https://']) {
    expect(text.includes(banned), banned).toBe(false);
  }
}, 120_000);

it('the production build ships the worker, manifest, icons and a precache list for the shell', () => {
  execFileSync('pnpm', ['--filter', '@limbo/aftershock', 'build'], { stdio: 'pipe', env: prodEnv });
  for (const f of ['sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
    expect(existsSync(resolve(dist, f)), f).toBe(true);
  }
  const sw = readFileSync(resolve(dist, 'sw.js'), 'utf8');
  for (const re of [/index\.html/, /assets\/index-[^"']+\.js/, /assets\/index-[^"']+\.css/, /assets\/shuffle\.worker-[^"']+\.js/, /\.woff2/]) {
    expect(re.test(sw), String(re)).toBe(true);
  }
  const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.webmanifest'), 'utf8'));
  expect(manifest.name).toBe('AFTERSHOCK');
  expect(manifest.short_name).toBe('AFTERSHOCK');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBe('#F2EADB');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  // The Workbox runtime file carries library URLs in its own text; the banned strings must still be absent.
  const text = textOf(dist);
  for (const banned of ['devrelay', 'DevRelayLink', 'window.limbo', 'localhost:5175', 'https://fonts']) {
    expect(text.includes(banned), banned).toBe(false);
  }
}, 120_000);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist') return [];
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const scanned = [
  ...sourceFiles(join(root, 'src')),
  join(root, 'index.html'),
  join(root, 'app.css'),
  join(root, 'README.md'),
];

it('wording scan: no "proven" claim, no "guaranteed", no field-use claim', () => {
  const claims = [/\bguaranteed?\b/i, /\bproven\b/i, /\bbattle[- ]tested\b/i, /\bin production use\b/i, /\bdeployed in the field\b/i, /\bused in the field\b/i, /\bfield[- ]tested\b/i, /\bfield[- ]proven\b/i];
  // Negations are the required disclaimers: "not proven", "not used in the field", "No field use is claimed".
  const allowed = [/\bnot proven\b/i, /\bnot used in the field\b/i];
  for (const f of scanned) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      let l = line;
      for (const a of allowed) l = l.replace(a, '');
      for (const c of claims) expect(c.test(l), `${f}:${i + 1} ${c}`).toBe(false);
    });
  }
});

it('colour literals live in tokens only', () => {
  const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
  for (const f of scanned) {
    // The one allowed literal: the PWA theme-color meta in index.html (offline-shell R5.2).
    const text = readFileSync(f, 'utf8').replace(/<meta name="theme-color" content="#F2EADB" \/>/, '');
    expect(colour.test(text), f).toBe(false);
  }
});

it('README states demonstration data and no field use', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  expect(readme).toMatch(/demonstration data/i);
  expect(readme).toMatch(/no field use is claimed/i);
  expect(readme).toMatch(/measured, property-tested/);
});
