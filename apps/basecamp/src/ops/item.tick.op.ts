// item.tick: sets `ticked` to an explicit value (never a toggle).
// Intent: a tick someone has seen another tick overwrite must lose to the later one; concurrent ticks to the same
// value collapse, different values surface as a twin (the model reads `twins`).
// Merge: causal-lww. State keeps every write by op id and re-derives the value, so order and duplicates cannot change it.
import { causalLww } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface TickPayload {
  ticked: boolean;
}

export interface TickState {
  ticks?: Record<string, { writes: Record<string, Op<TickPayload>>; ticked: boolean }>;
}

const def: OpDef<TickState, TickPayload> = {
  name: 'item.tick',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'ticked' },
  apply(s, op: Op<TickPayload>) {
    const cur = s.ticks?.[op.target];
    const writes = { ...(cur?.writes ?? {}), [op.id]: op };
    const ticked = causalLww(Object.values(writes)).value?.ticked === true;
    return { ...s, ticks: { ...(s.ticks ?? {}), [op.target]: { writes, ticked } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.ticks ?? {})) {
      if (typeof v.ticked !== 'boolean') return `target ${t} has a non-boolean ticked`;
      for (const w of Object.values(v.writes)) if (typeof w.payload.ticked !== 'boolean') return `write ${w.id} is not a boolean`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
