import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeSidecar, writeSidecar } from './sidecar.ts';
import type { VacuityReport } from './vacuity.ts';

const cfg = { tier: 'fast', replicas: 3, orderings: 10, seed: 1 };
const rep = (cls: string, share: number): VacuityReport => ({ runs: 10, share: { [cls]: share }, applicable: [cls], na: [] });

describe('sidecar merge', () => {
  it('starts from an empty or corrupt file', () => {
    expect(mergeSidecar('', cfg, 'a', rep('x', 1)).apps).toEqual({ a: rep('x', 1) });
    expect(mergeSidecar('{not json', cfg, 'a', rep('x', 1)).apps).toEqual({ a: rep('x', 1) });
  });
  it('keeps earlier apps whatever order the sweeps finish in', () => {
    const ab = mergeSidecar(JSON.stringify(mergeSidecar('', cfg, 'a', rep('x', 1))), cfg, 'b', rep('y', 0.5));
    const ba = mergeSidecar(JSON.stringify(mergeSidecar('', cfg, 'b', rep('y', 0.5))), cfg, 'a', rep('x', 1));
    expect(Object.keys(ab.apps).sort()).toEqual(['a', 'b']);
    expect(ab.apps).toEqual(ba.apps);
  });
  it('replaces the same app and adds no report for null', () => {
    const first = JSON.stringify(mergeSidecar('', cfg, 'a', rep('x', 1)));
    expect(mergeSidecar(first, cfg, 'a', rep('x', 0.7)).apps.a?.share.x).toBe(0.7);
    expect(mergeSidecar(first, cfg, null, null).apps).toEqual({ a: rep('x', 1) });
  });
});

describe('writeSidecar file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sidecar-test-'));
  const saved = process.env.LIMBO_PROPS_SIDECAR;
  afterEach(() => {
    if (saved === undefined) delete process.env.LIMBO_PROPS_SIDECAR;
    else process.env.LIMBO_PROPS_SIDECAR = saved;
  });
  it('accumulates reports from successive writes', () => {
    const file = join(dir, 's.json');
    writeFileSync(file, '');
    process.env.LIMBO_PROPS_SIDECAR = file;
    writeSidecar('a', rep('x', 1));
    writeSidecar('b', rep('y', 1));
    const out = JSON.parse(readFileSync(file, 'utf8')) as { apps: Record<string, unknown> };
    expect(Object.keys(out.apps).sort()).toEqual(['a', 'b']);
    rmSync(dir, { recursive: true, force: true });
  });
});
