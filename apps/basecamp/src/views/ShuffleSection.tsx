// ShuffleSection: mounts the layer's ShuffleTest over the ops on screen (both replicas, de-duplicated by id).
import type { ReactNode } from 'react';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { useLimbo } from '../../../../skeleton/src/limbo/index.ts';
import { ShuffleTest, type Golden, type ShuffleRunner } from '../../../../skeleton/src/limbo/shuffle-test.tsx';

/** The golden whose op ids equal the on-screen ids, or undefined (R12.3). */
export function matchGolden(ops: readonly Op[], goldens: readonly Golden[]): Golden | undefined {
  const ids = [...new Set(ops.map((o) => o.id))].sort();
  return goldens.find((g) => g.opIds.length === ids.length && [...g.opIds].sort().every((id, i) => id === ids[i]));
}

export function ShuffleSection(p: { createRunner: () => ShuffleRunner; goldens: readonly Golden[]; n?: number }): ReactNode {
  const a = useLimbo('a');
  const b = useLimbo('b');
  const ops = [...new Map([...a.replica.log(), ...b.replica.log()].map((o) => [o.id, o] as const)).values()];
  const golden = matchGolden(ops, p.goldens);
  return <ShuffleTest ops={ops} n={p.n ?? 1000} createRunner={p.createRunner} {...(golden ? { golden } : {})} />;
}
