import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerShell } from '../../offline-shell.ts';
import { shellOptions, THEME } from '../../pwa-options.ts';

const root = resolve(__dirname, '..');
const pub = (f: string) => resolve(root, 'public', f);
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

describe('shell icons and theme colour', () => {
  for (const size of [192, 512]) {
    it(`icon-${size}.png has the PNG signature and a ${size}x${size} IHDR`, () => {
      const b = readFileSync(pub(`icon-${size}.png`));
      expect([...b.subarray(0, 8)]).toEqual(SIGNATURE);
      expect(b.subarray(12, 16).toString('latin1')).toBe('IHDR');
      expect(b.readUInt32BE(16)).toBe(size);
      expect(b.readUInt32BE(20)).toBe(size);
    });
  }

  it('icon.svg exists and has no <text>', () => {
    expect(existsSync(pub('icon.svg'))).toBe(true);
    expect(readFileSync(pub('icon.svg'), 'utf8')).not.toContain('<text');
  });

  it('index.html sets the theme-color meta', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="theme-color" content="#F2EADB" />');
  });
});

describe('shell build options', () => {
  const o = shellOptions({ name: 'BASECAMP', description: 'd' });
  const m = o.manifest as Record<string, unknown>;

  it('declares a standalone manifest with the theme colour and relative start_url and scope', () => {
    expect(m.name).toBe('BASECAMP');
    expect(m.short_name).toBe('BASECAMP');
    expect(m.display).toBe('standalone');
    expect(THEME).toBe('#F2EADB');
    expect(m.theme_color).toBe(THEME);
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
  });

  it('updates at once, cleans old caches, registers by hand and stays off in dev', () => {
    expect(o.workbox).toMatchObject({ skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true });
    expect(o.injectRegister).toBe(false);
    expect(o.devOptions?.enabled).toBe(false);
  });
});

describe('registerShell', () => {
  const fake = () => ({ register: vi.fn(() => Promise.resolve({})) });

  it('does nothing when prod is false', async () => {
    const sw = fake();
    await registerShell({ prod: false, nav: { serviceWorker: sw } });
    expect(sw.register).toHaveBeenCalledTimes(0);
  });

  it('does nothing when the navigator has no serviceWorker', async () => {
    const warn = vi.fn();
    await registerShell({ prod: true, nav: {}, warn });
    expect(warn).toHaveBeenCalledTimes(0);
  });

  it('registers ./sw.js with scope ./ once in production', async () => {
    const sw = fake();
    await registerShell({ prod: true, nav: { serviceWorker: sw } });
    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('warns once and resolves when registration rejects', async () => {
    const err = new Error('nope');
    const sw = { register: vi.fn(() => Promise.reject(err)) };
    const warn = vi.fn();
    await expect(registerShell({ prod: true, nav: { serviceWorker: sw }, warn })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toBe(err);
  });
});
