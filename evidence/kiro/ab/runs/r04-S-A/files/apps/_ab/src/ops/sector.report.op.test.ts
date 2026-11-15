import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonical, createOp, newReplica, observe } from '../../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const apply = (s: unknown, op: Op): unknown => def.apply!(s, op);
const fold = (ops: Op[]): unknown => ops.reduce(apply, {} as unknown);

// A replica that has seen `seen` and then reports `sev` on sector S.
function report(r: string, sev: Severity, seen: Op[] = []): Op {
  const rep = newReplica(r);
  for (const o of seen) {
    observe(rep, o);
    rep.vv[o.stamp.r] = Math.max(rep.vv[o.stamp.r] ?? 0, o.stamp.n);
  }
  return createOp(rep, def, 'S', reportPayload({}, 'S', sev));
}

describe('sector.report', () => {
  it('shows none for a never-reported sector', () => {
    expect(severityOf({}, 'S')).toBe('none');
  });

  it('shows a single report', () => {
    expect(severityOf(fold([report('a', 'major')]), 'S')).toBe('major');
  });

  it('concurrent reports show the more severe, in either order', () => {
    const a = report('a', 'minor');
    const b = report('b', 'critical');
    expect(severityOf(fold([a, b]), 'S')).toBe('critical');
    expect(severityOf(fold([b, a]), 'S')).toBe('critical');
  });

  it('a re-inspection that saw the earlier reports may lower the severity', () => {
    const a = report('a', 'critical');
    const b = report('b', 'major');
    const c = report('c', 'minor', [a, b]);
    expect(severityOf(fold([a, b, c]), 'S')).toBe('minor');
  });

  it('a re-inspection concurrent with another report does not lower it', () => {
    const a = report('a', 'critical');
    const c = report('c', 'minor', [a]);
    const d = report('d', 'major'); // concurrent with a and c
    expect(severityOf(fold([a, c, d]), 'S')).toBe('major');
    expect(severityOf(fold([d, c, a]), 'S')).toBe('major');
  });

  it('does not mutate its input and ignores duplicates', () => {
    const a = report('a', 'minor');
    const s0 = fold([a]);
    const before = canonical(s0);
    apply(s0, report('b', 'major'));
    expect(canonical(s0)).toBe(before);
    expect(canonical(fold([a, a]))).toBe(before);
  });

  it('tracks sectors independently and the invariant holds', () => {
    const a = report('a', 'major');
    const s = apply(fold([a]), { ...report('b', 'minor'), target: 'T' });
    expect(severityOf(s, 'S')).toBe('major');
    expect(severityOf(s, 'T')).toBe('minor');
    expect(def.invariant!(s)).toBe(true);
  });

  it('reportPayload rejects an unknown severity', () => {
    expect(() => reportPayload({}, 'S', 'bad' as Severity)).toThrow();
  });

  it('property: any delivery order of a causally consistent history gives one state', () => {
    const sev = fc.constantFrom(...SEVERITIES);
    fc.assert(
      fc.property(
        fc.array(fc.record({ sev, seesPrev: fc.boolean() }), { minLength: 1, maxLength: 6 }),
        fc.integer(),
        (spec, seed) => {
          const ops: Op[] = [];
          spec.forEach((x, i) => ops.push(report(`r${i}`, x.sev, x.seesPrev ? ops.slice() : [])));
          // order consistent with deps: shuffle then stable-sort by Lamport counter
          const shuffled = ops
            .map((o, i) => ({ o, k: Math.imul(seed ^ (i + 1), 2654435761) >>> 0 }))
            .sort((p, q) => p.k - q.k)
            .map((p) => p.o)
            .sort((p, q) => p.stamp.l - q.stamp.l);
          return canonical(fold(shuffled)) === canonical(fold(ops));
        },
      ),
      { numRuns: 100 },
    );
  });
});
