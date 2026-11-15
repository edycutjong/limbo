// Intent `life`: delete versus edit.
// Oracle: an active delete is one no restore observed. An edit (create, restore, content write) resurrects
// iff no active delete observed it and it did not observe every active delete.
// No active delete: alive. Active deletes and a resurrecting edit: twin. Otherwise deleted.
// So delete || edit gives the twin; a Delete resolve that observed the edits gives deleted;
// a Keep that observed the active deletes gives alive.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck, sees } from './common.ts';

export type LifeKind = 'create' | 'restore' | 'delete' | 'edit';

export interface LifeSpec {
  kind(op: Op): LifeKind | undefined;
  read(state: State, target: string): 'alive' | 'deleted' | 'twin';
}

export function lifeIntent(spec: LifeSpec): RunCheck {
  return intentCheck('intent:life', (res) =>
    eachTarget(res, (o) => spec.kind(o) !== undefined, ({ state, target, ops }) => {
      const restores = ops.filter((o) => spec.kind(o) === 'restore');
      const active = ops.filter((o) => spec.kind(o) === 'delete' && !restores.some((r) => sees(r, o)));
      const edits = ops.filter((o) => spec.kind(o) !== 'delete');
      let want: 'alive' | 'deleted' | 'twin' = 'alive';
      if (active.length > 0) {
        const wins = edits.some((e) => !active.some((a) => sees(a, e)) && !active.every((a) => sees(e, a)));
        want = wins ? 'twin' : 'deleted';
      }
      const got = spec.read(state, target);
      return got === want ? true : `life is ${got}, expected ${want} (${active.length} active delete(s))`;
    }),
  );
}
