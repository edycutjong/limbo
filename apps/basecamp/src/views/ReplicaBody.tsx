// ReplicaBody: one replica's list and expenses. Twin variants, reorder, expense rows and the
// Inspector arrive in tasks 13 to 17.
import { useState, type ReactNode } from 'react';
import { Inspector, useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import type { State } from '../model.ts';
import { AddItem } from './AddItem.tsx';
import { ExpenseRow } from './ExpenseRow.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ItemTwins } from './ItemTwins.tsx';

export function ReplicaBody(p: { id: Id }): ReactNode {
  const { replica: raw, queued } = useLimbo(p.id);
  const [inspector, setInspector] = useState(false);
  const replica = raw as Replica<State>;
  const s = replica.state();
  const me = act.memberOf(replica);
  return (
    <div className="bc-body">
      <AddItem onAdd={(name) => act.addItem(replica, name)} />
      {s.order.length === 0 && <p className="bc-empty">Nothing packed yet. Add the first thing.</p>}
      <ul className="bc-list" aria-label="Packing list">
        {s.order.map((id, index) => {
          const item = s.items[id]!;
          return (
            <ItemTwins
              key={id}
              id={p.id}
              replica={replica}
              item={item}
              me={me}
              onInspect={() => setInspector(true)}
              row={(promoted) => (
                <ItemRow
                  promoted={promoted}
                  index={index}
                  count={s.order.length}
                  onMove={(to) => act.moveItem(replica, id, to)}
                  item={item}
                  me={me}
                  queuedClaim={queued.some((o) => o.op === 'item.claim' && o.target === id && (o.payload as { who?: string }).who === me)}
                  onTick={(t) => act.tickItem(replica, id, t)}
                  onRename={(n) => act.renameItem(replica, id, n)}
                  onDelete={() => act.deleteItem(replica, id)}
                  onClaim={() => act.claimItem(replica, id)}
                  onRelease={() => act.releaseItem(replica, id)}
                />
              )}
            />
          );
        })}
      </ul>
      <Inspector id={p.id} open={inspector} onOpenChange={setInspector} />
      <ul className="bc-expenses" aria-label="Shared expenses">
        {Object.values(s.expenses).map((e) => (
          <ExpenseRow key={e.id} id={p.id} replica={replica} expense={e} />
        ))}
      </ul>
    </div>
  );
}
