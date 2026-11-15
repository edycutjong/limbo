// Shared lifecycle state for item.delete and item.restore. Not an op file.
// State keeps every lifecycle op by id and re-derives life with the `resurrect` merge, so order and duplicates cannot change it.
import { resurrect, type Life, type LifeKind } from '../../../../skeleton/src/core/merges.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

export interface LifeState {
  life?: Record<string, { ops: Record<string, { kind: LifeKind; op: Op }>; life: Life }>;
}

export function applyLife(s: LifeState, kind: LifeKind, op: Op): LifeState {
  const ops = { ...(s.life?.[op.target]?.ops ?? {}), [op.id]: { kind, op } };
  const life = resurrect(Object.values(ops)).life;
  return { ...s, life: { ...(s.life ?? {}), [op.target]: { ops, life } } };
}

export function lifeInvariant(s: LifeState): true | string {
  for (const [t, v] of Object.entries(s.life ?? {})) {
    if (v.life !== 'alive' && v.life !== 'deleted' && v.life !== 'twin') return `target ${t} has life ${String(v.life)}`;
  }
  return true;
}
