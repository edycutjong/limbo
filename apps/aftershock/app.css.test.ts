import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (sel: string): string => {
  const i = css.indexOf(`${sel} {`);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
};

describe('aftershock app.css', () => {
  it('.as-cell:hover lifts and recolours the border, and .as-cell transitions use var(--ui-dur)', () => {
    const hover = block('.as-cell:hover');
    expect(hover).toMatch(/transform\s*:/);
    expect(hover).toMatch(/border-color\s*:/);
    const t = /transition\s*:([^;]*);/.exec(block('.as-cell'));
    expect(t).not.toBeNull();
    expect(t![1]).toContain('var(--ui-dur)');
  });

  it('has no per-component outline rules', () => {
    expect(css).not.toMatch(/outline\s*:/);
  });
});
