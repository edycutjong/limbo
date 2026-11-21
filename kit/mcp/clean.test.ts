import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir).filter((f) => /\.(ts|mjs)$/.test(f) && !f.endsWith('.test.ts'));

// R1.4: stdout carries only MCP frames. job-main.mjs holds the one reply line, written through a bound `reply`.
describe('kit/mcp stdout hygiene', () => {
  it('finds the server sources', () => {
    expect(sources).toEqual(expect.arrayContaining(['server.mjs', 'tools.ts', 'job.ts', 'job-main.mjs']));
  });

  it.each(sources)('%s has no console.log or process.stdout.write call', (file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    expect(text).not.toMatch(/console\.log\s*\(/);
    expect(text).not.toMatch(/process\.stdout\.write\s*\(/);
  });
});
