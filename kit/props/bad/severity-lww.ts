// severity-lww: severity is last-writer-wins by stamp, so a later, lower report overwrites a higher one.
import { maxIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

const ORDER = ['low', 'mid', 'high'];
type S = { lvl?: string | null; at?: [number, string, number] };
type P = { lvl: string | null };
const fixture: Fixture = {
  name: 'severity-lww',
  expectFails: ['intent:max'],
  def: asDef({
    name: 'f.sev',
    merge: 'causal-lww',
    intent: { kind: 'max', field: 'lvl', order: ORDER },
    apply: (s: S, op: { stamp: { l: number; r: string; n: number }; payload: P }): S => {
      const k: [number, string, number] = [op.stamp.l, op.stamp.r, op.stamp.n];
      const a = s.at;
      const higher = !a || k[0] !== a[0] ? !a || k[0] > a[0] : k[1] !== a[1] ? k[1] > a[1] : k[2] > a[2];
      return higher ? { lvl: op.payload.lvl, at: k } : s;
    },
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { lvl: r.chance(0.15) ? null : r.pick(ORDER) } }),
    checks: [
      maxIntent({
        order: ORDER,
        report: (o) => (o.op === 'f.sev' ? ((o.payload as P).lvl ?? undefined) : undefined),
        isClear: (o) => o.op === 'f.sev' && (o.payload as P).lvl === null,
        read: (s: S) => s.lvl ?? undefined,
      }),
    ],
  },
};
export default fixture;
