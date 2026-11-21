// The vacuity shares must not fall as unrelated ops are registered. Measures the fast-tier report for the
// registered BASECAMP defs plus 4 synthetic `commutes` ops that are in no conflict class. The dummies live
// only here and are registered nowhere.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { loadConfig } from './config.ts';
import type { RunOptions } from './run.ts';
import { MIN_SHARE, formatVacuity, measureVacuity, mixedGen, vacuityFailures } from './vacuity.ts';

const OPS_DIR = join(import.meta.dirname, '..', '..', 'apps', 'basecamp', 'src', 'ops');
const registry = (await import(pathToFileURL(join(OPS_DIR, 'registry.gen.ts')).href)) as { ops: OpDef[] };
const base = registry.ops;

const optsByOp = new Map<string, RunOptions>();
for (const d of base) {
  const m = (await import(pathToFileURL(join(OPS_DIR, `${d.name}.props.ts`)).href)) as { opts?: RunOptions };
  if (m.opts) optsByOp.set(d.name, m.opts);
}

const dummies: OpDef[] = [1, 2, 3, 4].map((i) => ({
  name: `dummy.op${i}`,
  merge: 'commutes',
  intent: { kind: 'delta', field: `d${i}` },
  apply: (s: unknown) => s,
}));

// Same generator and step range as the mixed property runs in suite.props.test.ts.
const gen = mixedGen(optsByOp);

describe('vacuity scaling', () => {
  it('keeps every applicable class at or above MIN_SHARE with 4 unrelated ops registered', () => {
    const cfg = loadConfig({ ...process.env, LIMBO_PROPS_TIER: 'fast' });
    const report = measureVacuity([...base, ...dummies], { gen, config: cfg });
    expect(report.applicable.length).toBeGreaterThan(0);
    expect(vacuityFailures(report, MIN_SHARE), formatVacuity(report)).toEqual([]);
  }, 600_000);
});
