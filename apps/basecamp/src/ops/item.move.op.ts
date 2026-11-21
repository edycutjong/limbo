// item.move: moves an item to a new fractional position key (carrying a replica suffix).
// Intent: a move someone has seen another move overwrite must lose to the later one; concurrent moves to different
// keys surface as a twin on `pos`, and the winner is picked deterministically by stamp.
// Merge: ordered-move. State keeps every move by op id and re-derives each item's key with causalLww,
// so order and duplicates cannot change it.
import { causalLww, type KeyPayload } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface MoveState {
  moves?: Record<string, { writes: Record<string, Op<KeyPayload>>; key: string }>;
}

const def: OpDef<MoveState, KeyPayload> = {
  name: 'item.move',
  merge: 'ordered-move',
  intent: { kind: 'move' },
  apply(s, op: Op<KeyPayload>) {
    const prev = s.moves?.[op.target]?.writes ?? {};
    const writes = { ...prev, [op.id]: op };
    const key = causalLww(Object.values(writes)).value!.key;
    return { ...s, moves: { ...(s.moves ?? {}), [op.target]: { writes, key } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.moves ?? {})) {
      if (typeof v.key !== 'string') return `target ${t} has a non-string key`;
      for (const w of Object.values(v.writes)) if (typeof w.payload.key !== 'string') return `move ${w.id} has a non-string key`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
