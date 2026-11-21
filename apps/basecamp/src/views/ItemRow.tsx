// ItemRow (R4.1, R4.9): drag handle, tick box, name, ClaimChip and an overflow menu.
// Space on the focused row ticks (explicit value), Delete deletes; both ignore text inputs.
// Reorder behaviour on the handle arrives in task 14. Names render as text.
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Item } from '../model.ts';
import { ClaimChip } from './ClaimChip.tsx';
import { TARGET } from './target.ts';

export interface ItemRowProps {
  item: Item;
  me: string;
  queuedClaim: boolean;
  onTick(ticked: boolean): void;
  onRename(name: string): void;
  onDelete(): void;
  onClaim(): void;
  onRelease(): void;
}

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

export function ItemRow(p: ItemRowProps): ReactNode {
  const { item } = p;
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>): void => {
    if (isTextField(e.target) || e.target !== e.currentTarget) return;
    if (e.key === ' ') {
      e.preventDefault();
      p.onTick(!item.ticked);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      p.onDelete();
    }
  };

  const commit = (): void => {
    const name = (editing ?? '').trim();
    setEditing(null);
    if (name !== '' && name !== item.name) p.onRename(name);
  };

  return (
    <li className="bc-row" data-limbo-row data-item={item.id} tabIndex={0} onKeyDown={onKeyDown}>
      <button type="button" className="bc-handle" aria-label={`Move ${item.name}`} style={TARGET}>
        ⠿
      </button>
      <input
        type="checkbox"
        aria-label={`Tick ${item.name}`}
        style={TARGET}
        checked={item.ticked}
        onChange={(e) => p.onTick(e.target.checked)}
      />
      {editing === null ? (
        <span className="bc-name" data-name>
          {item.name}
        </span>
      ) : (
        <input
          type="text"
          aria-label={`Rename ${item.name}`}
          style={TARGET}
          autoFocus
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(null);
          }}
          onBlur={commit}
        />
      )}
      <ClaimChip item={item} me={p.me} queued={p.queuedClaim} onClaim={p.onClaim} onRelease={p.onRelease} />
      <span className="bc-menu">
        <button
          type="button"
          aria-label={`More actions for ${item.name}`}
          aria-expanded={menu}
          style={TARGET}
          onClick={() => setMenu(!menu)}
        >
          ⋯
        </button>
        {menu && (
          <span role="group" aria-label={`Actions for ${item.name}`}>
            <button
              type="button"
              style={TARGET}
              onClick={() => {
                setMenu(false);
                setEditing(item.name);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              style={TARGET}
              onClick={() => {
                setMenu(false);
                p.onDelete();
              }}
            >
              Delete
            </button>
          </span>
        )}
      </span>
    </li>
  );
}
