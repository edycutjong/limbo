import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createOp, newReplica, observe, type Replica } from '../../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const apply = (s: unknown, op: Op) => def.apply!(s, op);
const fold = (ops: Op[]) => ops.reduce<unknown>(apply, {});

function report(r: ReturnType<typeof newReplica>, sev: Severity, sector = 's1', state: unknown = {}): Op {
  return createOp(r, def, sector, reportPayload(state, sector, sev));
}
/** Deliver op to replica: update its Lamport clock and version vector. */
function receive(r: ReturnType<typeof newReplica>, op: Op): void {
  observe(r, op);
  r.vv[op.stamp.r] = Math.max(r.vv[op.stamp.r] ?? 0, op.stamp.n);
}

describe('sector.report', () => {
  it('shows none for a never-reported sector', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });

  it('a single report sets the severity', () => {
    const a = newReplica('a');
    expect(severityOf(fold([report(a, 'major')]), 's1')).toBe('major');
  });

  it('concurrent reports show the more severe, in either order', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const x = report(a, 'critical');
    const y = report(b, 'minor');
    expect(severityOf(fold([x, y]), 's1')).toBe('critical');
    expect(severityOf(fold([y, x]), 's1')).toBe('critical');
  });

  it('a re-inspection that saw the earlier report can lower it', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const x = report(a, 'critical');
    receive(b, x);
    const y = report(b, 'minor');
    expect(severityOf(fold([x, y]), 's1')).toBe('minor');
    expect(severityOf(fold([y, x]), 's1')).toBe('minor');
  });

  it('a lowering report stays concurrent-max with an unseen report', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const c = newReplica('c');
    const x = report(a, 'critical');
    receive(b, x);
    const y = report(b, 'minor'); // lowers x
    const z = report(c, 'major'); // concurrent with both
    expect(severityOf(fold([x, y, z]), 's1')).toBe('major');
  });

  it('sectors are independent and apply does not mutate its input', () => {
    const a = newReplica('a');
    const s0 = {};
    const s1 = apply(s0, report(a, 'major', 's1'));
    expect(s0).toEqual({});
    const s2 = apply(s1, report(a, 'minor', 's2'));
    expect(severityOf(s2, 's1')).toBe('major');
    expect(severityOf(s2, 's2')).toBe('minor');
  });

  it('property: any delivery order (with duplicates) gives the same severity', () => {
    const sev = fc.constantFrom(...SEVERITIES);
    fc.assert(
      fc.property(
        fc.array(fc.record({ r: fc.constantFrom('a', 'b', 'c'), sev, seen: fc.array(fc.nat(7), { maxLength: 3 }) }), { minLength: 1, maxLength: 8 }),
        fc.integer(),
        (specs, seed) => {
          const reps: Record<string, Replica> = {};
          const ops: Op[] = [];
          for (const sp of specs) {
            const rep = (reps[sp.r] ??= newReplica(sp.r));
            for (const i of sp.seen) if (ops[i] !== undefined) receive(rep, ops[i]!);
            ops.push(report(rep, sp.sev));
          }
          const shuffled = [...ops, ...ops].map((o, i) => ({ o, k: Math.sin(seed + i * 7919) })).sort((p, q) => p.k - q.k).map((p) => p.o);
          expect(severityOf(fold(shuffled), 's1')).toBe(severityOf(fold(ops), 's1'));
        },
      ),
    );
  });
});
