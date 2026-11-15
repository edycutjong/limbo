import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { classify, measureVacuity, vacuityFailures, vacuityReport } from './vacuity.ts';
import { checkManifest, checkRun, failingProperties, type RunOptions } from './run.ts';

type S = { v?: number; n?: number; ticked?: boolean };
const gen: RunOptions['gen'] = (def, rand) => ({
  target: 't',
  payload: def.name === 'stub.inc' ? { by: 1 + rand.int(3) } : { v: rand.int(4) },
});
const inc: OpDef<S, { by: number }> = {
  name: 'stub.inc',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'n' },
  apply: (s, op) => ({ ...s, n: (s.n ?? 0) + op.payload.by }),
};
// Wrong on purpose: declares `commutes` but a set does not commute.
const setBad: OpDef<S, { v: number }> = {
  name: 'stub.setbad',
  merge: 'commutes',
  intent: { kind: 'set', field: 'v' },
  apply: (s, op) => ({ ...s, v: op.payload.v }),
};
// Wrong on purpose: last arrival wins, so replicas diverge.
const arrival: OpDef<S, { v: number }> = {
  name: 'stub.arrival',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'v' },
  apply: (s, op) => ({ ...s, v: op.payload.v }),
};

describe('run harness', () => {
  it('a correct commutes op passes every simulated property', () => {
    expect(failingProperties(inc as unknown as OpDef, { gen }, 60)).toEqual([]);
  });

  it('a set declared as commutes fails commutes', () => {
    expect(failingProperties(setBad as unknown as OpDef, { gen }, 30)).toContain('commutes');
  });

  it('an arrival-order reducer fails convergence', () => {
    expect(failingProperties(arrival as unknown as OpDef, { gen }, 60)).toContain('convergence');
  });

  it('failure message has the script, delivery order, seed and trace', () => {
    let msg = '';
    for (let s = 0; s < 60 && msg === ''; s++) {
      msg = checkRun(arrival as unknown as OpDef, s, 10, { gen }).find((f) => f.property === 'convergence')?.reason ?? '';
    }
    expect(msg).toContain('shrunk script');
    expect(msg).toContain('delivery order per replica');
    expect(msg).toContain('seed:');
    expect(msg).toContain('explainTrace');
  });

  it('manifest check: match, mismatch, missing entry, missing file', () => {
    const d = inc as unknown as OpDef;
    expect(checkManifest(d, { 'stub.inc': { kind: 'delta', field: 'n' } })).toBe(true);
    expect(checkManifest(d, { 'stub.inc': { kind: 'set', field: 'n' } })).toMatch(/declares intent/);
    expect(checkManifest(d, {})).toMatch(/missing from intents.json/);
    expect(checkManifest(d, undefined)).toMatch(/not found/);
  });
});

const mk = (r: string, n: number, l: number, op: string, target: string, payload: unknown, deps: Record<string, number> = {}): Op => ({
  id: `${r}:${n}`,
  op,
  target,
  payload,
  stamp: { l, r, n },
  deps,
});

describe('vacuity guard', () => {
  it('classify flags each class on a hand-made script', () => {
    const has = (ops: Op[], c: string) => expect(classify(ops).has(c), c).toBe(true);
    has([mk('a', 1, 1, 'item.delete', 'x', {}), mk('b', 1, 1, 'item.tick', 'x', { done: true })], 'delete-edit');
    has([mk('a', 1, 1, 'item.delete', 'x', {}), mk('b', 1, 1, 'item.restore', 'x', {})], 'restore-delete');
    has(
      [mk('a', 1, 1, 'item.delete', 'x', {}), mk('b', 1, 1, 'item.delete', 'x', {}), mk('c', 1, 2, 'item.restore', 'x', {}, { a: 1 })],
      'keep-delete',
    );
    has([mk('a', 1, 1, 'item.claim', 'x', { who: 'ann' }), mk('b', 1, 1, 'item.claim', 'x', { who: 'ann' })], 'claim-claim');
    has([mk('a', 1, 1, 'item.claim', 'x', { who: 'ann' }), mk('b', 1, 1, 'item.delete', 'x', {})], 'claim-delete');
    has([mk('a', 1, 1, 'item.move', 'x', { key: 'a1' }), mk('b', 1, 1, 'item.move', 'x', { key: 'a2' })], 'move-move');
    has([mk('a', 1, 1, 'item.move', 'x', { key: 'a1' }), mk('b', 1, 1, 'item.move', 'y', { key: 'a1' })], 'move-same-gap');
    has([mk('a', 1, 1, 'item.move', 'x', { key: 'a1' }), mk('b', 1, 1, 'item.delete', 'x', {})], 'move-delete');
    has(
      [
        mk('a', 1, 1, 'item.claim', 'x', { who: 'ann' }),
        mk('a', 2, 2, 'item.release', 'x', { who: 'ann' }, { a: 1 }),
        mk('a', 3, 3, 'item.claim', 'x', { who: 'ann' }, { a: 2 }),
      ],
      'claim-release-claim',
    );
    has([mk('a', 1, 1, 'item.rename', 'x', { name: 'S' }), mk('b', 1, 1, 'item.rename', 'x', { name: 'S' })], 'lww-equal');
    has([mk('a', 1, 1, 'item.rename', 'x', { name: 'S' }), mk('b', 1, 1, 'item.rename', 'x', { name: 'T' })], 'lww-different');
  });

  it('does not flag causally ordered ops as conflicts', () => {
    const ops = [mk('a', 1, 1, 'item.claim', 'x', { who: 'ann' }), mk('b', 1, 2, 'item.claim', 'x', { who: 'bo' }, { a: 1 })];
    expect(classify(ops).size).toBe(0);
  });

  it('fails a class under 50% and reports unregistered classes as n/a', () => {
    const claim: OpDef = { name: 'item.claim', merge: 'claim-one', intent: { kind: 'claim' } };
    let k = 0;
    const wide: RunOptions['gen'] = () => ({ target: `u${k++}`, payload: { who: 'ann' } });
    const rep = measureVacuity([claim], { gen: wide }, 40);
    expect(vacuityFailures(rep).join('\n')).toMatch(/claim-claim/);
    expect(rep.na).toContain('delete-edit');
    expect(vacuityFailures(rep).join('\n')).not.toMatch(/delete-edit/);
    const hot: RunOptions['gen'] = () => ({ target: 't', payload: { who: 'ann' } });
    const ok = measureVacuity([claim], { gen: hot, steps: { min: 8, max: 14 } }, 40);
    expect(vacuityFailures(ok)).toEqual([]);
  });

  it('share is the fraction of runs containing the class', () => {
    const r = vacuityReport(['item.claim'], [new Set(['claim-claim']), new Set(), new Set(['claim-claim']), new Set()]);
    expect(r.share['claim-claim']).toBe(0.5);
    expect(vacuityFailures(r)).toEqual([]);
  });
});
