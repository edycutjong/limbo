import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { fixtures } from './bad/index.ts';
import { asDef } from './bad/types.ts';
import * as engine from './engine.ts';
import { simulate } from '../../skeleton/src/core/simulate.ts';
import tickDef from '../../apps/basecamp/src/ops/item.tick.op.ts';
import { opts as tickOpts } from '../../apps/basecamp/src/ops/item.tick.props.ts';
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
    expect(Object.keys(run).sort()).toEqual([...PRE_CHANGE_RUN_EXPORTS, 'fuzz', 'runOnce'].sort());
    for (const k of Object.keys(engine).filter((k) => k !== 'runOnce' && k !== 'fuzz')) {
      expect((run as Record<string, unknown>)[k]).toBe((engine as Record<string, unknown>)[k]);
    }
    expect(Object.keys(engine).sort()).toEqual([...PRE_CHANGE_RUN_EXPORTS.filter((k) => k !== 'runOpProperties'), 'fuzz', 'runOnce'].sort());
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

const P = { orderings: 100, replicas: 3, seed: 20251031 };
const fx0 = (name: string) => fixtures.find((f) => f.name === name)!;
// Fixture defs are not in intents.json; give each a manifest entry for its own intent.
const fx = (name: string) => {
  const f = fx0(name);
  return { ...f, opts: { ...f.opts!, manifest: { [f.def!.name]: f.def!.intent } } };
};

describe('fuzz', () => {
  it('passes a good registered op with the requested run count', () => {
    const r = engine.fuzz(tickDef as OpDef, tickOpts, P);
    expect(r.pass).toBe(true);
    expect(r.runs).toBe(100);
    expect(r.truncated).toBe(false);
    expect(r.vacuity.concurrentShare).toBeGreaterThan(0);
    expect(r.vacuity.concurrentShare).toBeLessThanOrEqual(1);
    expect(r.counterexample).toBeUndefined();
  });

  it('fails tick-toggle with an intent:set counterexample', () => {
    const f = fx('tick-toggle');
    const r = engine.fuzz(f.def!, f.opts!, P);
    expect(r.pass).toBe(false);
    expect(r.counterexample).toBeDefined();
    expect(f.expectFails).toContain(r.counterexample!.property);
  });

  it('fails lww-wallclock with a counterexample', () => {
    const f = fx('lww-wallclock');
    const r = engine.fuzz(f.def!, f.opts!, P);
    expect(r.pass).toBe(false);
    expect(f.expectFails).toContain(r.counterexample!.property);
  });

  it('gives equal results for equal inputs', () => {
    const f = fx('tick-toggle');
    expect(engine.fuzz(f.def!, f.opts!, P)).toEqual(engine.fuzz(f.def!, f.opts!, P));
    // The wall-clock fixture reads the real clock, so its reason text differs between calls.
    const w = fx('lww-wallclock');
    const strip = (r: engine.FuzzResult) => ({ ...r, counterexample: { ...r.counterexample!, reason: '' } });
    const a = strip(engine.fuzz(w.def!, w.opts!, P));
    expect(a.counterexample.script.length).toBeGreaterThan(0);
    expect(a).toEqual(strip(engine.fuzz(w.def!, w.opts!, P)));
    expect(engine.fuzz(tickDef as OpDef, tickOpts, P)).toEqual(engine.fuzz(tickDef as OpDef, tickOpts, P));
  });

  it('truncates at a 1 ms deadline', () => {
    const r = engine.fuzz(tickDef as OpDef, tickOpts, { ...P, orderings: 5000, deadlineMs: 1 });
    expect(r.truncated).toBe(true);
    expect(r.runs).toBeLessThan(5000);
  });

  it('reports a manifest failure without a script', () => {
    const f = fx('tick-toggle');
    const r = engine.fuzz(f.def!, { ...f.opts, manifest: {} }, P);
    expect(r.pass).toBe(false);
    expect(r.counterexample!.property).toBe('manifest');
    expect(r.counterexample!.script).toEqual([]);
  });

  it('counterexample replays through simulate(); wall-clock replicas end in different states', () => {
    const f = fx('lww-wallclock');
    const r = engine.fuzz(f.def!, f.opts!, P);
    const ce = r.counterexample!;
    const init = f.opts!.init ?? (() => ({}));
    const res = simulate({ defs: [f.def!], replicas: ce.replicas, seed: ce.seed, steps: ce.steps, init, gen: f.opts!.gen! });
    expect(res.ops.map((o) => ({ id: o.id, op: o.op, target: o.target, payload: o.payload, stamp: o.stamp, deps: o.deps }))).toEqual(ce.script);
    expect(res.orders).toEqual(ce.deliveries);
    expect(new Set(Object.values(res.states)).size).toBeGreaterThan(1);
  });
});
