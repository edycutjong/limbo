import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule block whose selector mentions :focus-visible. */
function focusRules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1]!.trim(), body: m[2]! });
  return out;
}

describe('focus ring (R7.1)', () => {
  it('has exactly one :focus-visible rule: 3px --ink outline, 2px offset', () => {
    const rules = focusRules();
    expect(rules).toHaveLength(1);
    const r = rules[0]!;
    expect(r.selector).toBe(':focus-visible');
    expect(r.body).toMatch(/outline:\s*3px\s+solid\s+var\(--ink\)/);
    expect(r.body).toMatch(/outline-offset:\s*2px/);
  });

  it('no other :focus-visible rule sets outline', () => {
    const others = focusRules().filter((r) => r.selector !== ':focus-visible');
    expect(others.filter((r) => /outline/.test(r.body))).toEqual([]);
  });
});
