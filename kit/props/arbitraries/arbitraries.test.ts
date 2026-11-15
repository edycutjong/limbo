import { describe, expect, it } from 'vitest';
import { simulate } from '../../../skeleton/src/core/simulate.ts';
import type { OpDef } from '../../../skeleton/src/core/types.ts';
import { applicableClasses, basecampPayloads, CONFLICT_CLASSES, conflictGen } from './index.ts';

const def = (name: string): OpDef => ({ name, merge: 'causal-lww', intent: { kind: 'set', field: 'f' } });

describe('conflict-template generators', () => {
  it('is deterministic for a seed and weights ops toward the hot targets', () => {
    const run = (seed: number) => simulate({ defs: [def('item.rename')], replicas: 3, seed, steps: 200, gen: conflictGen({ payloads: basecampPayloads }) });
    const a = run(7);
    expect(a.ops).toEqual(run(7).ops);
    const hot = a.ops.filter((o) => o.target === 't0' || o.target === 't1').length / a.ops.length;
    expect(hot).toBeGreaterThan(0.6);
  });

  it('makes equal and different concurrent values both common', () => {
    const r = simulate({ defs: [def('item.rename')], replicas: 3, seed: 3, steps: 300, gen: conflictGen({ payloads: basecampPayloads }) });
    const names = r.ops.filter((o) => o.target === 't0').map((o) => (o.payload as { name: string }).name);
    expect(new Set(names).size).toBeGreaterThan(1);
    expect(names.filter((n) => n === 'Stove').length).toBeGreaterThan(1);
  });

  it('reports classes with unregistered ops as n/a', () => {
    const { applicable, na } = applicableClasses(['item.rename']);
    expect(applicable).toEqual(['lww-equal', 'lww-different']);
    expect(applicable.length + na.length).toBe(CONFLICT_CLASSES.length);
    expect(CONFLICT_CLASSES.length).toBe(11);
  });
});
