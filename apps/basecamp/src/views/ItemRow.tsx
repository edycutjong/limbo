// ItemRow (R4.1, R4.9): drag handle, tick box, name, ClaimChip and an overflow menu.
// Space on the focused row ticks (explicit value), Delete deletes; both ignore text inputs.
// Reorder (R3.8, R4.8): ArrowUp/ArrowDown on the handle move one place and keep focus on the handle;
// a pointer drag over the sibling rows calls onMove with the target index. Names render as text.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Item } from '../model.ts';
import { ClaimChip } from './ClaimChip.tsx';
import { TARGET } from './target.ts';

export interface ItemRowProps {
  item: Item;
  me: string;
  queuedClaim: boolean;
  promoted?: boolean;
  /** A scripted op changed this row (R11.3). */
  scripted?: boolean;
  /** Position in the visible order and the number of visible rows. */
  index?: number;
  count?: number;
  /** Move to `index` among the other visible items. */
  onMove?(index: number): void;
  onTick(ticked: boolean): void;
  onRename(name: string): void;
  onDelete(): void;
  onClaim(): void;
  onRelease(): void;
}

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

/** Index the dragged row takes among the other rows, from the pointer's y over the sibling rects. */
export function dropIndex(list: Element, id: string, y: number): number {
  let n = 0;
  for (const r of Array.from(list.querySelectorAll<HTMLElement>('[data-item]'))) {
    if (r.dataset.item === id) continue;
    const b = r.getBoundingClientRect();
    if (y > b.top + b.height / 2) n++;
  }
  return n;
}

export function ItemRow(p: ItemRowProps): ReactNode {
  const { item } = p;
  const handle = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      handle.current?.focus();
    }
  }, [p.index]);

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const i = p.index ?? 0;
    const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (!p.onMove || to < 0 || to > (p.count ?? 1) - 1) return;
    refocus.current = true;
    p.onMove(to);
  };

  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const list = e.currentTarget.closest('ul');
    if (!list || !p.onMove) return;
    const up = (ev: Event): void => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const to = dropIndex(list, item.id, (ev as MouseEvent).clientY);
      if (to !== p.index) {
        refocus.current = true;
        p.onMove?.(to);
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
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
    <li className="bc-row" data-limbo-row data-item={item.id} data-ticked={item.ticked} tabIndex={0} onKeyDown={onKeyDown}>
      <button
        ref={handle}
        type="button"
        className="bc-handle ui-btn"
        aria-label={`Move ${item.name}`}
        style={{ ...TARGET, touchAction: 'none' }}
        onKeyDown={onHandleKey}
        onPointerDown={onHandleDown}
      >
        ⠿
      </button>
      <input
        type="checkbox"
        className="bc-tick ui-check"
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
          className="ui-input"
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
      {p.scripted && <span className="bc-scripted">scripted edit</span>}
      <ClaimChip item={item} me={p.me} queued={p.queuedClaim} promoted={p.promoted === true} onClaim={p.onClaim} onRelease={p.onRelease} />
      <span className="bc-menu">
        <button
          type="button"
          className="ui-btn"
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
              className="ui-btn ui-btn--quiet"
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
              className="ui-btn ui-btn--quiet"
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
