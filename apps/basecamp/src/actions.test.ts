import { describe, expect, it } from 'vitest';
import { createReplica, type Replica } from '../../../skeleton/src/sync/replica.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import * as act from './actions.ts';
import { describeConflicts, twinCount } from './conflicts.ts';
import { materialize, type State } from './model.ts';
import { ops as defs } from './ops/registry.gen.ts';
import { seedOps } from './seed.ts';

type R = Replica<State>;
let n = 0;
const make = (id: string): Promise<R> =>
  createReplica<State>({ app: 'basecamp', replicaId: id, defs, materialize, twinCount, store: openStore(`actions-${id}-${n++}`), seedOps });
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
  it('add item gives distinct ids on two replicas and a key after the last item', async () => {
    const [a, b] = await pair();
    const x = act.addItem(a, 'Lantern');
    const y = act.addItem(b, 'Lantern');
    expect(x.id).toBe(x.target);
    expect(x.target).not.toBe(y.target);
    sync(a, b);
    expect(a.state().order).toHaveLength(12);
    expect(a.state().order.at(-1)).toBeDefined();
    expect(canonical(a.state())).toBe(canonical(b.state()));
  });

  it('tick never toggles: two ticks of true stay true', async () => {
    const [a] = await pair();
    act.tickItem(a, 'tent', true);
    act.tickItem(a, 'tent', true);
    expect(a.state().items.tent!.ticked).toBe(true);
    act.tickItem(a, 'tent', false);
    expect(a.state().items.tent!.ticked).toBe(false);
  });

  it('move allocates a key between its new neighbours', async () => {
    const [a] = await pair();
    act.moveItem(a, 'rope', 1);
    const s = a.state();
    expect(s.order.slice(0, 3)).toEqual(['tent', 'rope', 'stove']);
    expect(s.items.tent!.pos < s.items.rope!.pos && s.items.rope!.pos < s.items.stove!.pos).toBe(true);
    act.moveItem(a, 'rope', 99);
    expect(a.state().order.at(-1)).toBe('rope');
  });

  it('delete then restore', async () => {
    const [a] = await pair();
    act.deleteItem(a, 'rope');
    expect(a.state().order).not.toContain('rope');
    act.restoreItem(a, 'rope');
    expect(a.state().order).toContain('rope');
    expect(a.state().items.rope!.life).toBe('alive');
  });

  it('claim and release use the member id', async () => {
    const [a] = await pair();
    act.claimItem(a, 'rope');
    expect(a.state().items.rope!.winners).toEqual(['sari']);
    act.releaseItem(a, 'rope');
    expect(a.state().items.rope!.winners).toEqual([]);
  });

  it('Keep resolves a resurrect twin on both replicas', async () => {
    const [a, b] = await pair();
    act.tickItem(a, 'tent', true);
    act.deleteItem(b, 'tent');
    sync(a, b);
    expect(ids(a)).toEqual(['tent:life']);
    act.restoreItem(a, 'tent');
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
  });

  it('Delete resolves a resurrect twin on both replicas', async () => {
    const [a, b] = await pair();
    act.tickItem(a, 'tent', true);
    act.deleteItem(b, 'tent');
    sync(a, b);
    act.deleteItem(b, 'tent');
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(a.state().items.tent!.life).toBe('deleted');
  });

  it('release clears a claim-one loser twin on both replicas', async () => {
    const [a, b] = await pair();
    act.claimItem(a, 'stove');
    act.claimItem(b, 'stove');
    sync(a, b);
    expect(ids(b)).toEqual(['stove:claim:budi']);
    act.releaseItem(b, 'stove');
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(a.state().items.stove!.winners).toEqual(['sari']);
  });

  it('rename, tick and setAmount picks clear value twins on both replicas', async () => {
    const [a, b] = await pair();
    act.renameItem(a, 'rope', 'Rope A');
    act.renameItem(b, 'rope', 'Rope B');
    act.tickItem(a, 'cooler', true);
    act.tickItem(b, 'cooler', false);
    act.setAmount(a, 'campsite', 5000);
    act.setAmount(b, 'campsite', 4000);
    sync(a, b);
    expect(ids(a).sort()).toEqual(['campsite:amount', 'cooler:ticked', 'rope:name']);
    act.renameItem(a, 'rope', 'Rope B');
    act.tickItem(b, 'cooler', true);
    act.setAmount(a, 'campsite', 4000);
    sync(a, b);
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(a.state().expenses.campsite!.amountCents).toBe(4000);
  });

  it('expense member actions: add, then remove', async () => {
    const [a, b] = await pair();
    act.addExpenseMember(a, 'gas-snacks', 'dewi');
    expect(a.state().expenses['gas-snacks']!.members).toContain('dewi');
    act.removeExpenseMember(a, 'gas-snacks', 'dewi');
    sync(a, b);
    expect(b.state().expenses['gas-snacks']!.members).not.toContain('dewi');
    expect(canonical(a.state())).toBe(canonical(b.state()));
  });
});
