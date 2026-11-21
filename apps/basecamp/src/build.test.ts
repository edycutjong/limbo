import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// Vitest sets NODE_ENV=test and MODE=test; a real production build must not inherit them.
const prodEnv = { ...process.env, NODE_ENV: 'production', MODE: 'production' };
const dist = resolve(__dirname, '../dist');

function textOf(dir: string): string {
  return readdirSync(dir)
    .map((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? textOf(p) : readFileSync(p, 'utf8');
    })
    .join('\n');
}

it('pnpm --filter @limbo/basecamp build produces dist/index.html', () => {
  execFileSync('pnpm', ['--filter', '@limbo/basecamp', 'build'], { stdio: 'pipe', env: prodEnv });
  expect(existsSync(resolve(dist, 'index.html'))).toBe(true);
}, 120_000);

it('the production build contains no dev relay, no window.limbo, no localhost:5175, no CDN font', () => {
  execFileSync('pnpm', ['--filter', '@limbo/basecamp', 'build'], { stdio: 'pipe', env: prodEnv });
  const text = textOf(dist);
  expect(text.length).toBeGreaterThan(1000);
  for (const banned of ['devrelay', 'DevRelayLink', 'window.limbo', 'localhost:5175', 'https://fonts']) {
    expect(text.includes(banned), banned).toBe(false);
  }
}, 120_000);

it('the production build ships the worker, manifest, icons and a precache list for the shell', () => {
  execFileSync('pnpm', ['--filter', '@limbo/basecamp', 'build'], { stdio: 'pipe', env: prodEnv });
  for (const f of ['sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
    expect(existsSync(resolve(dist, f)), f).toBe(true);
  }
  const sw = readFileSync(resolve(dist, 'sw.js'), 'utf8');
  for (const re of [/index\.html/, /assets\/index-[^"']+\.js/, /assets\/index-[^"']+\.css/, /assets\/shuffle\.worker-[^"']+\.js/, /\.woff2/]) {
    expect(re.test(sw), String(re)).toBe(true);
  }
  const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.webmanifest'), 'utf8'));
  expect(manifest.name).toBe('BASECAMP');
  expect(manifest.short_name).toBe('BASECAMP');
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
