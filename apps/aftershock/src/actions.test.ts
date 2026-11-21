import { describe, expect, it } from 'vitest';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import { createReplica, type Replica } from '../../../skeleton/src/sync/replica.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import * as act from './actions.ts';
import { describeConflicts, twinCount } from './conflicts.ts';
import { materialize, type State } from './model.ts';
import { ops as defs } from './ops/registry.gen.ts';
import { seedOps } from './seed.ts';

type R = Replica<State>;
let n = 0;
const make = (id: string): Promise<R> =>
  createReplica<State>({ app: 'aftershock', replicaId: id, defs, materialize, twinCount, store: openStore(`as-actions-${id}-${n++}`), seedOps });
const pair = async (): Promise<[R, R]> => [await make('a'), await make('b')];
/** Manual delivery: each side receives what the other holds. */
const sync = (a: R, b: R): void => {
  for (let i = 0; i < 2; i++) {
    a.receive(b.applied());
    b.receive(a.applied());
  }
};
const ids = (r: R): string[] => describeConflicts(r.state()).map((d) => d.id);

describe('actions', () => {
  it('memberOf maps a to sari and b to budi; the count target follows it', async () => {
    const [a, b] = await pair();
    expect(act.memberOf(a)).toBe('sari');
    expect(act.memberOf(b)).toBe('budi');
    expect(act.setCount(a, 'C3', 2).target).toBe('C3#sari');
    expect(act.setCount(b, 'C3', 3).target).toBe('C3#budi');
    sync(a, b);
    const c3 = a.state().sectors.C3!;
    expect(c3.total).toBe(5);
    expect(c3.counts.map((c) => [c.who, c.value])).toEqual([['sari', 2], ['budi', 3]]);
  });

  it('pressing a need twice makes two adds, and removeNeed is a separate unneed op', async () => {
    const [a] = await pair();
    const x = act.addNeed(a, 'C3', 'water');
    const y = act.addNeed(a, 'C3', 'water');
    expect([x.op, y.op]).toEqual(['sector.need', 'sector.need']);
    expect(a.state().sectors.C3!.needs).toEqual(['water']);
    const z = act.removeNeed(a, 'C3', 'water');
    expect(z.op).toBe('sector.unneed');
    expect(a.state().sectors.C3!.needs).toEqual([]);
  });

  it('resolving a note twin clears it on both replicas after delivery', async () => {
    const [a, b] = await pair();
    act.setNote(a, 'C3', 'cracked stairwell');
    act.setNote(b, 'C3', 'gas smell, east wall');
    sync(a, b);
    expect(ids(a)).toEqual(['C3:note']);
    expect(ids(b)).toEqual(['C3:note']);
    act.pickNote(a, 'C3', 'gas smell, east wall');
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(a.state().sectors.C3!.note).toBe('gas smell, east wall');
    expect(canonical(a.state())).toBe(canonical(b.state()));
  });

  it('resolving a count twin clears it on both replicas after delivery', async () => {
    const [a, b] = await pair();
    act.setCount(a, 'C3', 2);
    act.setCount(b, 'C3', 3);
    sync(a, b);
    expect(ids(a)).toEqual([]);
    // Sari's own register is twinned when two different counts for her target are concurrent.
    act.pickCount(b, 'C3', 'sari', 4); // b writes sari's register while a does too
    act.pickCount(a, 'C3', 'sari', 5);
    sync(a, b);
    expect(ids(a)).toEqual(['C3:count:sari']);
    expect(ids(b)).toEqual(['C3:count:sari']);
    act.pickCount(a, 'C3', 'sari', 5);
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(b.state().sectors.C3!.counts.find((c) => c.who === 'sari')!.value).toBe(5);
    expect(canonical(a.state())).toBe(canonical(b.state()));
  });

  it('re-inspection lowers an observed unsafe and leaves a concurrent report standing', async () => {
    const [a, b] = await pair();
    act.reportSector(a, 'C3', 'unsafe');
    sync(a, b);
    expect(b.state().sectors.C3!.severity).toBe('unsafe');
    // A re-inspects (clear then report) while B concurrently reports damaged.
    const [clear, report] = act.reinspectSector(a, 'C3', 'safe');
    expect([clear!.op, report!.op]).toEqual(['sector.clear', 'sector.report']);
    expect(a.state().sectors.C3!.severity).toBe('safe');
    act.reportSector(b, 'C3', 'damaged');
    sync(a, b);
    expect(a.state().sectors.C3!.severity).toBe('damaged');
    expect(canonical(a.state())).toBe(canonical(b.state()));
    // Without a concurrent report the observed unsafe is gone.
    const [c] = await pair();
    act.reportSector(c, 'D4', 'unsafe');
    act.reinspectSector(c, 'D4', 'safe');
    expect(c.state().sectors.D4!.severity).toBe('safe');
  });

  it('actions write explicit values: repeating one gives the same state', async () => {
    const [a] = await pair();
    act.setCount(a, 'C3', 2);
    const once = canonical(a.state().sectors.C3!.counts);
    act.setCount(a, 'C3', 2);
    expect(canonical(a.state().sectors.C3!.counts)).toBe(once);
    act.setNote(a, 'C3', 'x');
    act.setNote(a, 'C3', 'x');
    expect(a.state().sectors.C3!.note).toBe('x');
  });
});
