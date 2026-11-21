// ReplicaBody: one replica's body: grid, then the card of this replica's own selected sector.
import { useState, type ReactNode } from 'react';
import { useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import type { State } from '../model.ts';
import { SectorCard } from './SectorCard.tsx';
import { SectorGrid } from './SectorGrid.tsx';

export const EMPTY_TEXT = 'No sectors reported yet. Tap a sector to report.';

export function ReplicaBody(p: { id: Id; selected?: string | undefined }): ReactNode {
  const { replica } = useLimbo(p.id);
  const [selected, setSelected] = useState<string | undefined>(p.selected);
  const s = (replica as Replica<State>).state();
  const reported = Object.values(s.sectors).filter((x) => x.severity !== undefined).length;
  return (
    <div className="as-body">
      {reported === 0 && <p className="as-empty">{EMPTY_TEXT}</p>}
      <SectorGrid sectors={s.sectors} selected={selected} onSelect={setSelected} />
      <p className="as-selected" data-selected>
        {selected ? `Sector ${selected}` : 'No sector selected.'}
      </p>
      {selected && <SectorCard id={selected} sector={s.sectors[selected]} />}
    </div>
  );
}
