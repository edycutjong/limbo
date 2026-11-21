import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'tokens.css'), 'utf8');

type RGB = [number, number, number];
const root = /:root\s*\{[^}]*\}/.exec(css)![0];
const token = (name: string): RGB => {
  const m = new RegExp(`--${name}:\\s*#([0-9A-Fa-f]{6})\\b`).exec(root);
  if (!m) throw new Error(`token --${name} not found`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (c: RGB): number => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const over = (top: RGB, alpha: number, base: RGB): RGB =>
  top.map((v, i) => v * alpha + base[i]! * (1 - alpha)) as RGB;

function block(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no rule ${selector}`);
  return css.slice(css.indexOf('{', i), css.indexOf('}', i) + 1);
}
const mixes = (text: string): { name: string; pct: number }[] =>
  [...text.matchAll(/color-mix\(in srgb,\s*var\(--([\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g)].map((m) => ({
    name: m[1]!,
    pct: Number(m[2]),
  }));

const veil = block('.limbo-fog-veil {');

describe('fog veil', () => {
  const layers = mixes(veil);
  it('parses one grain layer and three gradient stops', () => {
    expect(layers).toHaveLength(4);
  });

  for (const [label, bg] of [['--card', 'card'], ['--bg', 'bg']] as const) {
    it(`keeps --ink at >= 4.5:1 over the composited veil on ${label}`, () => {
      const [grain, ...stops] = layers;
      for (const stop of stops) {
        const mid = over(token(stop.name), stop.pct / 100, token(bg));
        const full = over(token(grain!.name), grain!.pct / 100, mid);
        expect(contrast(token('ink'), full)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('uses no url(', () => {
    expect(css).not.toMatch(/url\(/);
  });

  it('adds no animation to the veil beyond the limbo-drain rule', () => {
    expect(veil).not.toMatch(/animation/);
    expect(block('[data-fog="haze"] .limbo-fog-veil')).not.toMatch(/animation/);
    const rules = [...css.matchAll(/([^{}]*\.limbo-fog-veil[^{}]*)\{([^}]*)\}/g)].filter((m) => /animation/.test(m[2]!));
    expect(rules.map((m) => m[1]!.trim())).toEqual(['.limbo-drain .limbo-fog-veil']);
    expect(rules[0]![2]).toContain('limbo-drain');
  });
});
