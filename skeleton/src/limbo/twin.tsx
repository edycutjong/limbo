// Twin: a generic shell. The app passes the content; the layer only decides when the ghost shows and leaves.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLimbo, type Id } from './shell.tsx';

/** One row: at-rest content, an offset decorative ghost, then caption, rule line and actions at full opacity.
 *  `id` is the conflict descriptor id on `replica`. The row is the only `[data-limbo-row]` for the target. */
export function Twin(p: {
  replica: Id;
  id: string;
  atRest: ReactNode;
  ghost: ReactNode;
  caption: ReactNode;
  rule: string;
  actions: ReactNode;
}): ReactNode {
  const { conflicts, motion } = useLimbo(p.replica);
  const present = conflicts.some((d) => d.id === p.id);
  const was = useRef(false);
  const [done, setDone] = useState(false);
  if (present) {
    was.current = true;
    if (done) setDone(false);
  }
  const leaving = !present && was.current && motion === 'full' && !done;
  if (!present && !leaving) return null;
  const full = motion === 'full';
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter' || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.querySelector<HTMLButtonElement>('.limbo-twin-actions button')?.click();
  };
  return (
    <div
      className={`limbo-twin${full ? (leaving ? ' limbo-twin-leaving' : ' limbo-twin-enter') : ''}`}
      data-limbo-row=""
      data-leaving={leaving ? 'true' : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="limbo-twin-stage">
        <div className="limbo-twin-rest">{p.atRest}</div>
        <div
          className="limbo-twin-ghost"
          aria-hidden="true"
          style={{ transform: 'translate(6px, 6px)', outline: '1px dashed var(--twin)', opacity: 0.7, position: 'absolute', inset: 0, pointerEvents: 'none' }}
          onAnimationEnd={leaving ? () => setDone(true) : undefined}
        >
          {p.ghost}
        </div>
      </div>
      <span className="limbo-twin-label">TWIN</span>
      <div className="limbo-twin-caption">{p.caption}</div>
      <div className="limbo-twin-rule">{`Decided by: ${p.rule}`}</div>
      <div className="limbo-twin-actions">{p.actions}</div>
    </div>
  );
}
