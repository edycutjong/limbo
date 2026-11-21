// ReplicaBody: one replica's list and expenses. Twin variants, reorder, expense rows and the
// Inspector arrive in tasks 13 to 17.
import type { ReactNode } from 'react';
import { useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import { formatCents } from '../money.ts';
import type { State } from '../model.ts';
import { AddItem } from './AddItem.tsx';
import { ItemRow } from './ItemRow.tsx';

export function ReplicaBody(p: { id: Id }): ReactNode {
  const { replica: raw, queued } = useLimbo(p.id);
  const replica = raw as Replica<State>;
  const s = replica.state();
  const me = act.memberOf(replica);
  return (
    <div className="bc-body">
      <AddItem onAdd={(name) => act.addItem(replica, name)} />
      {s.order.length === 0 && <p className="bc-empty">Nothing packed yet. Add the first thing.</p>}
      <ul className="bc-list" aria-label="Packing list">
        {s.order.map((id) => {
          const item = s.items[id]!;
          return (
            <ItemRow
              key={id}
              item={item}
              me={me}
              queuedClaim={queued.some((o) => o.op === 'item.claim' && o.target === id && (o.payload as { who?: string }).who === me)}
              onTick={(t) => act.tickItem(replica, id, t)}
              onRename={(n) => act.renameItem(replica, id, n)}
              onDelete={() => act.deleteItem(replica, id)}
              onClaim={() => act.claimItem(replica, id)}
              onRelease={() => act.releaseItem(replica, id)}
            />
          );
        })}
      </ul>
      <ul className="bc-expenses" aria-label="Shared expenses">
        {Object.values(s.expenses).map((e) => (
          <li key={e.id}>{`${e.label} ${formatCents(e.amountCents)}`}</li>
        ))}
      </ul>
    </div>
  );
}
