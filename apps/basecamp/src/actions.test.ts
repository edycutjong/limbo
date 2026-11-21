import { describe, expect, it } from 'vitest';
import { createReplica, type Replica } from '../../../skeleton/src/sync/replica.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
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
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const decode3 = (s: string): number => [...s].reduce((n, c) => n * 62 + B62.indexOf(c), 0);
const unb62 = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i += 3) out += String.fromCharCode(decode3(s.slice(i, i + 3)));
  return out;
};
const ids = (r: R): string[] => describeConflicts(r.state()).map((d) => d.id);

describe('actions without a member or items', () => {
  it('acts as its own replica id when it has no member', async () => {
    const c = await make('c');
    expect(act.memberOf(c)).toBe('c');
    expect(act.memberOf(await make('a'))).toBe('sari');
    expect(act.claimItem(c, 'tent').payload).toEqual({ who: 'c' });
  });

  it('adds the first item to an empty list', async () => {
    const e = await createReplica<State>({ app: 'basecamp', replicaId: 'a', defs, materialize, twinCount, store: openStore(`actions-empty-${n++}`), seedOps: [] });
    expect(e.state().order).toEqual([]);
    const op = act.addItem(e, 'First');
    expect(e.state().order).toEqual([op.id]);
  });
});

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

  it('move after a restore with equal keys: keys differ, move applies, replicas converge', async () => {
    const [a, b] = await pair();
    const o = a.state().order;
    const [x, y, z] = [o[5]!, o[6]!, o[8]!];
    act.moveItem(a, x, 1);
    act.deleteItem(a, x);
    act.moveItem(a, y, 1);
    act.restoreItem(a, x);
    const s = a.state();
    expect(s.items[x]!.pos).not.toBe(s.items[y]!.pos);
    const i = Math.min(s.order.indexOf(x), s.order.indexOf(y)) + 1;
    const others = s.order.filter((k) => k !== z);
    const idx = others.indexOf(s.order[i - 1]!) + 1;
    const before = s.items[z]!.pos;
    let m;
    expect(() => (m = act.moveItem(a, z, idx))).not.toThrow();
    expect(a.state().items[z]!.pos).not.toBe(before);
    expect(a.applied().some((p) => p.id === m!.id)).toBe(true);
    sync(a, b);
    expect(canonical(a.state())).toBe(canonical(b.state()));
  });

  it('pre-fix equal keys: move between them does not throw and the new key is above K', async () => {
    const [a] = await pair();
    const K = 'a5';
    const add = (n: number, id: string, key: string): Op => ({
      id: `q:${n}`, op: 'item.add', target: id, payload: { name: id, key, units: 1 }, stamp: { l: n, r: 'q', n }, deps: n > 1 ? { q: n - 1 } : {},
    });
    a.receive([add(1, 'p', K), add(2, 'q', K)]);
    const o = a.state().order;
    const at = o.indexOf('p') + 1;
    const mover = o[0]!;
    const others = o.filter((k) => k !== mover);
    const idx = others.indexOf('p') + 1;
    expect(at).toBeGreaterThan(0);
    expect(() => act.moveItem(a, mover, idx)).not.toThrow();
    expect(a.state().items[mover]!.pos > K).toBe(true);
  });

  it('the key of addItem and moveItem ops decodes to the op id', async () => {
    const [a] = await pair();
    const ops = [act.addItem(a, 'N1'), act.moveItem(a, 'rope', 1), act.addItem(a, 'N2'), act.moveItem(a, 'tent', 3)];
    for (const op of ops) {
      const key = (op.payload as { key: string }).key;
      const L = decode3(key.slice(-4, -1));
      const enc = key.slice(-4 - 3 * L, -4);
      expect(key.endsWith('1')).toBe(true);
      expect(unb62(enc)).toBe(op.id);
    }
  });

  it('addItem allocates with right === null', async () => {
    const [a] = await pair();
    const op = act.addItem(a, 'Tail');
    const s = a.state();
    const last = s.order.at(-1)!;
    expect(last).toBe(op.id);
    expect(s.items[last]!.pos > s.items[s.order.at(-2)!]!.pos).toBe(true);
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
