// item.rename: sets `name` to an explicit value (never an edit script).
// Intent: a rename someone has seen another rename overwrite must lose to the later one; concurrent renames to the same
// name collapse, different names surface as a twin (the model reads `twins`).
// Merge: causal-lww. State keeps every write by op id and re-derives the value, so order and duplicates cannot change it.
import { causalLww } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface RenamePayload {
  name: string;
}

export interface RenameState {
  names?: Record<string, { writes: Record<string, Op<RenamePayload>>; name: string | undefined }>;
}

const def: OpDef<RenameState, RenamePayload> = {
  name: 'item.rename',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'name' },
  apply(s, op: Op<RenamePayload>) {
    const cur = s.names?.[op.target];
    const writes = { ...(cur?.writes ?? {}), [op.id]: op };
    const name = causalLww(Object.values(writes)).value?.name;
    return { ...s, names: { ...(s.names ?? {}), [op.target]: { writes, name } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.names ?? {})) {
      if (typeof v.name !== 'string') return `target ${t} has a non-string name`;
      for (const w of Object.values(v.writes)) if (typeof w.payload.name !== 'string') return `write ${w.id} is not a string`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
