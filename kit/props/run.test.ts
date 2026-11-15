import { describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
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
