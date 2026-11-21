// Inspector: a drawer listing the real sync state of one replica. It formats what it is given.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Op, OpDef, Stamp } from '../core/types.ts';
import { useDefs, useLimbo, type Id } from './shell.tsx';

const fmtStamp = (s: Stamp): string => `${s.l}·${s.r}·${s.n}`;
const fmtDeps = (d: Record<string, number>): string => {
  const e = Object.entries(d);
  return e.length === 0 ? 'none' : e.map(([r, n]) => `${r}:${n}`).join(' ');
};
const fmtIntent = (d: OpDef | undefined): string => {
  if (d === undefined) return 'unknown';
  const i = d.intent as { kind: string; field?: string };
  return i.field === undefined ? i.kind : `${i.kind} ${i.field}`;
};

interface Row {
  key: string;
  dir?: 'in' | 'out';
  name: string;
  target: string;
  merge: string;
  intent: string;
  stamp: string;
  deps: string;
}

function Table(p: { rows: Row[]; empty: string; label: string }): ReactNode {
  if (p.rows.length === 0) return <p>{p.empty}</p>;
  const dir = p.rows.some((r) => r.dir !== undefined);
  return (
    <table aria-label={p.label}>
      <thead>
        <tr>
          {dir && <th>dir</th>}
          <th>op</th>
          <th>target</th>
          <th>merge</th>
          <th>intent</th>
          <th>stamp</th>
          <th>deps</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={r.key}>
            {dir && <td>{r.dir}</td>}
            <td>{r.name}</td>
            <td>{r.target}</td>
            <td>{r.merge}</td>
            <td>{r.intent}</td>
            <td>{r.stamp}</td>
            <td>{r.deps}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Inspector(p: { id: Id; open?: boolean; onOpenChange?(open: boolean): void }): ReactNode {
  const { view, replica, session, queued, exchanges, conflicts, resolved } = useLimbo(p.id);
  const defs = useDefs();
  const [inner, setInner] = useState(false);
  const open = p.open ?? inner;
  const setOpen = (o: boolean): void => (p.onOpenChange ? p.onOpenChange(o) : setInner(o));
  const opener = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  useEffect(() => {
    if (open) close.current?.focus();
    else if (was.current) opener.current?.focus();
    was.current = open;
  }, [open]);

  const def = (name: string): OpDef | undefined => defs.find((d) => d.name === name);
  const opRow = (o: Op): Row => ({
    key: o.id,
    name: o.op,
    target: o.target,
    merge: def(o.op)?.merge ?? 'unknown',
    intent: fmtIntent(def(o.op)),
    stamp: fmtStamp(o.stamp),
    deps: fmtDeps(o.deps),
  });
  const recent = [...exchanges.last].reverse();

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab' && drawer.current) {
      const f = Array.from(drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !drawer.current.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !drawer.current.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <button ref={opener} type="button" className="limbo-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        Inspector
      </button>
      {open && (
        <div ref={drawer} role="dialog" aria-modal="true" aria-labelledby="limbo-inspector-title" className="limbo-inspector" onKeyDown={onKey}>
          <h2 id="limbo-inspector-title">Limbo inspector</h2>
          <button ref={close} type="button" className="limbo-button" onClick={() => setOpen(false)}>
            Close
          </button>
          <section aria-label="Link">
            <h3>Link</h3>
            <p>Link: {view.link}</p>
            <p>Peer: {session.peerId() ?? 'none yet'}</p>
          </section>
          <section aria-label="Queued ops">
            <h3>Queued ops</h3>
            <Table label="Queued ops" empty="No queued ops." rows={queued.map(opRow)} />
          </section>
          <section aria-label="Recent exchanges">
            <h3>Recent exchanges</h3>
            {recent.length === 0 && <p>No exchanges yet.</p>}
            {recent.map((x, i) => (
              <Table
                key={`${x[0]?.id ?? ''}:${recent.length - i}`}
                label={`Exchange ${recent.length - i}`}
                empty="No ops crossed."
                rows={x.map((c, j) => ({
                  key: `${c.id}:${j}`,
                  dir: c.side === p.id ? 'in' : 'out',
                  name: c.name,
                  target: c.target,
                  merge: c.merge,
                  intent: fmtIntent(def(c.name)),
                  stamp: fmtStamp(c.stamp),
                  deps: fmtDeps(c.deps),
                }))}
              />
            ))}
          </section>
          <section aria-label="Conflicts">
            <h3>Conflicts</h3>
            {conflicts.length + resolved.length === 0 && <p>No conflicts.</p>}
            <ul>
              {conflicts.map((d) => (
                <li key={d.id}>
                  {d.target}: {d.caption} (rule: {d.rule})
                </li>
              ))}
              {resolved.map((d) => (
                <li key={`r:${d.id}`} data-resolved="">
                  {d.target}: {d.caption} (rule: {d.rule}) resolved
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Replica">
            <h3>Replica</h3>
            <p>Replica: {replica.id}</p>
            <p>vv: {fmtDeps(replica.vv())}</p>
            <p>Log size: {replica.log().length}</p>
          </section>
        </div>
      )}
    </>
  );
}
