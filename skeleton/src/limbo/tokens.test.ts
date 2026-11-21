import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'tokens.css'), 'utf8');

// R13.1, verbatim.
const R13_ROOT = `:root {
  --bg:#F2EADB; --card:#E8DDC9; --ink:#2A2019; --muted:#6B5B4B; --rule:#CDBFA8;
  --live:#2F6B4F; --before:#8F989C; --fog-ink:#4E5A60; --developing:#80560F; --twin:#2F5D86; --after:#8A2E22;
  --font-display:"Old Standard TT","Libre Caslon Text",Georgia,serif;
  --font-body:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",system-ui,sans-serif;
  --font-data:"DM Mono",ui-monospace,monospace;
}`;

function rootBlock(): string {
  const m = /:root\s*\{[^}]*\}/.exec(css);
  if (!m) throw new Error('no :root block');
  return m[0];
}

function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of rootBlock().matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) out[m[1]!] = m[2]!;
  return out;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('tokens.css', () => {
  it('has the :root block of R13.1 exactly', () => {
    expect(rootBlock()).toBe(R13_ROOT);
  });

  it('keeps every text token at 4.5:1 or more on --bg and --card', () => {
    const t = tokens();
    for (const name of ['ink', 'muted', 'live', 'fog-ink', 'developing', 'twin', 'after']) {
      expect(contrast(t[name]!, t.bg!), `${name} on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[name]!, t.card!), `${name} on card`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('matches the design table to two decimals', () => {
    const t = tokens();
    const table: Record<string, [number, number]> = {
      ink: [13.32, 11.84],
      muted: [5.45, 4.85],
      live: [5.26, 4.68],
      'fog-ink': [5.94, 5.28],
      developing: [5.4, 4.8],
      twin: [5.8, 5.15],
      after: [7.04, 6.26],
      before: [2.46, 2.19],
    };
    for (const [name, [onBg, onCard]] of Object.entries(table)) {
      expect(contrast(t[name]!, t.bg!)).toBeCloseTo(onBg, 1);
      expect(contrast(t[name]!, t.card!)).toBeCloseTo(onCard, 1);
    }
  });

  it('never uses --before as a text colour', () => {
    expect(/(^|[;{\s])color\s*:\s*var\(\s*--before\b/.test(css)).toBe(false);
    expect(/(^|[;{\s])color\s*:\s*#8F989C/i.test(css)).toBe(false);
  });

  it('uses tabular numerals for counts and amounts', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums');
  });

  it('loads no font or asset from the network under skeleton/src/limbo', () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (!p.endsWith('tokens.test.ts')) files.push(p);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toContain('https://');
      expect(text, f).not.toContain('fonts.googleapis');
    }
  });
});
