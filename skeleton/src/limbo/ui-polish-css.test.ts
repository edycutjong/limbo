import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

describe('ui-polish round 2 css', () => {
  it('twin buttons are 44 px controls and the twin block is a card with a twin-coloured left border', () => {
    expect(css).toMatch(/\.limbo-twin-actions button\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.limbo-twin \{[^}]*border-left: 3px solid var\(--twin\)[^}]*\}/);
    expect(css).toMatch(/\.limbo-twin \{[^}]*background: var\(--card\)/);
  });
  it('the desktop pair grid has wide columns and a narrow gutter', () => {
    expect(css).toContain('grid-template-columns: minmax(340px, 1fr) minmax(120px, 160px) minmax(340px, 1fr)');
  });
});
