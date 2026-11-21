import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { fixtures } from './bad/index.ts';
import { asDef } from './bad/types.ts';
import * as engine from './engine.ts';
import * as run from './run.ts';

// Runtime exports of `run.ts` before the engine extraction (types are erased).
const PRE_CHANGE_RUN_EXPORTS = [
  'MANIFEST_PATH',
  'PROPERTY_NAMES',
  'checkManifest',
  'checkRun',
  'failingProperties',
  'formatFailure',
  'loadManifest',
  'runOpProperties',
];

type S = { n?: number };
const inc: OpDef = asDef({
  name: 'stub.inc',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'n' },
  apply: (s: S, op: { payload: { by: number } }) => ({ ...s, n: (s.n ?? 0) + op.payload.by }),
});
const gen = (_def: OpDef, rand: { int(n: number): number }) => ({ target: 't', payload: { by: 1 + rand.int(3) } });

describe('engine', () => {
  it('has no vitest import', () => {
    const src = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from\s+['"]vitest['"]/);
    expect(src).not.toMatch(/import\(['"]vitest['"]\)/);
  });

  it('run.ts exports the pre-change names and re-exports the engine harness', () => {
    expect(Object.keys(run).sort()).toEqual([...PRE_CHANGE_RUN_EXPORTS, 'runOnce'].sort());
    for (const k of Object.keys(engine).filter((k) => k !== 'runOnce')) {
      expect((run as Record<string, unknown>)[k]).toBe((engine as Record<string, unknown>)[k]);
    }
    expect(Object.keys(engine).sort()).toEqual([...PRE_CHANGE_RUN_EXPORTS.filter((k) => k !== 'runOpProperties'), 'runOnce'].sort());
  });

  it('checkRun and runOnce(...).failures agree on a good def', () => {
    const opts = { gen: gen as never, manifest: { 'stub.inc': inc.intent } };
    for (let seed = 0; seed < 20; seed++) {
      const a = engine.checkRun(inc, seed, 8, opts);
      const b = engine.runOnce(inc, seed, 8, opts);
      expect(a).toEqual(b.failures);
      expect(a).toEqual([]);
      expect(b.res.ops.length).toBeGreaterThan(0);
    }
  });

  it('checkRun and runOnce(...).failures agree on a fixture def', () => {
    const fx = fixtures.find((f) => f.def !== undefined && f.opts !== undefined);
    expect(fx).toBeDefined();
    let failed = 0;
    for (let seed = 0; seed < 60; seed++) {
      const a = engine.checkRun(fx!.def!, seed, 10, fx!.opts);
      expect(a).toEqual(engine.runOnce(fx!.def!, seed, 10, fx!.opts).failures);
      failed += a.length;
    }
    expect(failed).toBeGreaterThan(0);
  });
});
