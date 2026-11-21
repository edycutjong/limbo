import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '..', '..', 'scripts', 'gate-integrity.mjs');
let root: string;

function put(rel: string, text: string): void {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
}
function run(...args: string[]) {
  const r = spawnSync('node', [SCRIPT, ...args], { env: { ...process.env, LIMBO_GATE_ROOT: root }, encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gate-'));
  put('kit/hooks/a.mjs', 'a');
  put('kit/props/vacuity.ts', 'v');
  expect(run('--write').code).toBe(0);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('gate-integrity', () => {
  it('exits 0 when equal', () => {
    expect(run().code).toBe(0);
  });
  it('lists a changed file', () => {
    put('kit/props/vacuity.ts', 'v2');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.err).toContain('changed: kit/props/vacuity.ts');
  });
  it('lists an added file', () => {
    put('kit/props/arbitraries/x.ts', 'x');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.err).toContain('added: kit/props/arbitraries/x.ts');
  });
  it('lists a removed file', () => {
    unlinkSync(join(root, 'kit/hooks/a.mjs'));
    const r = run();
    expect(r.code).toBe(1);
    expect(r.err).toContain('removed: kit/hooks/a.mjs');
  });
  it('fails when the manifest is missing', () => {
    unlinkSync(join(root, 'evidence/kiro/gate-manifest.json'));
    expect(run().code).toBe(1);
  });
});
