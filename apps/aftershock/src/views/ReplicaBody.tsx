// ReplicaBody: one replica's body: grid, then the card of this replica's own selected sector.
import { useState, type ReactNode } from 'react';
import { Inspector, useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import type { State } from '../model.ts';
import { SectorCard } from './SectorCard.tsx';
import { SectorGrid } from './SectorGrid.tsx';
import { useScripted } from './ScenePanel.tsx';
import { SectorTwins } from './SectorTwins.tsx';

export const EMPTY_TEXT = 'No sectors reported yet. Tap a sector to report.';

const FIELD: Record<string, string> = { 'sector.report': 'report', 'sector.count': 'count', 'sector.note': 'note' };

/** Fields of `sector` changed by scripted ops this replica holds, in a stable order. */
function scriptedFields(log: readonly Op[], ids: ReadonlySet<string>, sector: string): string[] {
  const out = new Set<string>();
  for (const o of log) {
    const f = FIELD[o.op];
    if (f && ids.has(o.id) && o.target.split('#')[0] === sector) out.add(f);
  }
  return [...out];
}

export function ReplicaBody(p: { id: Id; selected?: string | undefined }): ReactNode {
  const { replica } = useLimbo(p.id);
  const [selected, setSelected] = useState<string | undefined>(p.selected);
  const [inspector, setInspector] = useState(false);
  const scripted = useScripted().ids;
  const s = (replica as Replica<State>).state();
  const reported = Object.values(s.sectors).filter((x) => x.severity !== undefined).length;
  return (
    <div className="as-body">
      {reported === 0 && <p className="as-empty">{EMPTY_TEXT}</p>}
      <SectorGrid sectors={s.sectors} selected={selected} onSelect={setSelected} />
      <p className="as-selected" data-selected>
        {selected ? `Sector ${selected}` : 'No sector selected.'}
      </p>
      {selected && (
        <SectorCard id={selected} sector={s.sectors[selected]} scripted={scriptedFields(replica.log(), scripted, selected)}>
          <SectorTwins id={p.id} replica={replica as Replica<State>} sector={s.sectors[selected]} />
        </SectorCard>
      )}
      <Inspector id={p.id} open={inspector} onOpenChange={setInspector} />
    </div>
  );
}
