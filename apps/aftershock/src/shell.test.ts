import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
