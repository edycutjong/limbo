// STUB model for task 7 only; task 8 replaces it with the real sector fold (design §4).
// It applies ops through a causal buffer and returns the sorted applied op ids, so it is order- and duplicate-insensitive.
import { causalBuffer } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';

export interface State {
  applied: string[];
}

export function materialize(ops: readonly Op[]): State {
  const buf = causalBuffer();
  const ids: string[] = [];
  for (const o of ops) for (const a of buf.offer(o)) ids.push(a.id);
  return { applied: [...new Set(ids)].sort() };
}
