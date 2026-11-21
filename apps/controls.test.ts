import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Selector of every rule block in the sheet (media blocks flattened). */
const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith('@'));
const has = (re: RegExp) => selectors.some((s) => re.test(s));

describe('controls.css', () => {
  it('has no # colour literal, no url(, no network @import', () => {
    expect(css).not.toMatch(/#/);
    expect(css).not.toMatch(/url\(/i);
    expect(css).not.toMatch(/@import[^;]*(https?:)?\/\//i);
  });

  it('every transition uses var(--ui-dur)', () => {
    const decls = [...css.matchAll(/(?<![-\w])transition\s*:([^;]*);/g)]
      .map((m) => m[1]!)
      .filter((v) => v.trim() !== 'none !important');
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) {
      for (const part of d.split(/,(?![^(]*\))/)) expect(part).toContain('var(--ui-dur)');
    }
  });

  it('defines every control class', () => {
    for (const c of ['ui-btn', 'ui-btn--quiet', 'ui-input', 'ui-check', 'ui-chip', 'ui-card', 'ui-note']) {
      expect(has(new RegExp(`\\.${c}(?![\\w-])`)), c).toBe(true);
    }
    for (const c of ['limbo-button', 'limbo-lever', 'limbo-reset']) {
      expect(has(new RegExp(`\\.${c}(?![\\w-])`)), c).toBe(true);
    }
  });

  it('has a selector for each R1.5 state (rest, hover, press, disabled; focus is the shared ring)', () => {
    expect(has(/^\.ui-btn$|^\.ui-btn,/m)).toBe(true); // rest
    expect(has(/\.ui-btn:hover/)).toBe(true);
    expect(has(/\.ui-btn:active/)).toBe(true);
    expect(has(/\.ui-btn:disabled/)).toBe(true);
    expect(has(/\.ui-input:hover/)).toBe(true);
    expect(has(/\.ui-input:active/)).toBe(true);
    expect(has(/\.ui-input:disabled/)).toBe(true);
    expect(has(/\.ui-input$/m)).toBe(true);
    expect(has(/\.limbo-lever:hover/)).toBe(true);
    expect(has(/\.limbo-reset:disabled/)).toBe(true);
    const tokens = readFileSync(join(dir, '../skeleton/src/limbo/tokens.css'), 'utf8');
    expect(tokens).toMatch(/:focus-visible/);
  });

  it('adds no font-family outside the tokens', () => {
    for (const m of css.matchAll(/font-family\s*:([^;]*);/g)) expect(m[1]).toMatch(/var\(--font-(body|display|data)\)/);
  });
});
