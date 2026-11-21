// sector.count: sets one surveyor's headcount for a sector to an explicit value (target `<sector>#<member>`).
// Intent: two surveyors counting the same sector offline must both be kept (one target each); if the same surveyor's
// count is overwritten by one that did not see it, the later stamp wins and the other surfaces as a twin.
// Merge: causal-lww. State keeps every write by op id and re-derives the value, so order and duplicates cannot change it.
import { causalLww } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { MAX_COUNT } from '../sectors.ts';

export interface CountPayload {
  count: number;
}

export interface CountState {
  counts?: Record<string, { writes: Record<string, Op<CountPayload>>; count: number | undefined }>;
}

const def: OpDef<CountState, CountPayload> = {
  name: 'sector.count',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'count' },
  apply(s, op: Op<CountPayload>) {
    const cur = s.counts?.[op.target];
    const writes = { ...(cur?.writes ?? {}), [op.id]: op };
    const count = causalLww(Object.values(writes)).value?.count;
    return { ...s, counts: { ...(s.counts ?? {}), [op.target]: { writes, count } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.counts ?? {})) {
      if (!Number.isInteger(v.count) || (v.count as number) < 0 || (v.count as number) > MAX_COUNT) return `target ${t} has an invalid count`;
      for (const w of Object.values(v.writes)) {
        const c = w.payload.count;
        if (!Number.isInteger(c) || c < 0 || c > MAX_COUNT) return `write ${w.id} is not an integer 0..${MAX_COUNT}`;
      }
    }
    return true;
  },
};

export default def as unknown as OpDef;
