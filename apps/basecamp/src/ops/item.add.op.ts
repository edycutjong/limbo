// item.add: creates an item. Intent: two people adding items offline must both appear, so an add never overwrites another add.
// Merge: commutes. State is keyed by op id, so order and duplicates cannot change it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AddPayload {
  name: string;
  units: number;
  /** Fractional-index key for the initial position. */
  key: string;
}

export interface AddState {
  adds?: Record<string, AddPayload & { target: string }>;
}

const def: OpDef<AddState, AddPayload> = {
  name: 'item.add',
  merge: 'commutes',
  intent: { kind: 'create' },
  apply(s, op: Op<AddPayload>) {
    const { name, units, key } = op.payload;
    return { ...s, adds: { ...(s.adds ?? {}), [op.id]: { target: op.target, name, units, key } } };
  },
  invariant(s) {
    for (const [id, a] of Object.entries(s.adds ?? {})) {
      if (!Number.isInteger(a.units) || a.units < 1) return `add ${id} has units ${String(a.units)}, expected an integer >= 1`;
      if (typeof a.name !== 'string' || typeof a.key !== 'string') return `add ${id} has a non-string name or key`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
