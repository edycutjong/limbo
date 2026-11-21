// Presentation marks bound to `useLimbo`: Fog and StatusChip. They display derived state and compute nothing of their own.
import type { ReactNode } from 'react';
import { useLimbo, type Id } from './shell.tsx';

export type FogMode = 'full' | 'haze' | 'none';

const NO_POINTER = { pointerEvents: 'none' } as const;
const SVG = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Wraps one replica's content. Full fog while the link is not up; haze while syncing; nothing otherwise. */
export function Fog(p: { id: Id; children?: ReactNode }): ReactNode {
  const { view } = useLimbo(p.id);
  const n = view.unacked + view.behind;
  const mode: FogMode = view.axis === 'FOGGED' ? 'full' : view.axis === 'DEVELOPING' && n > 0 ? 'haze' : 'none';
  return (
    <div className="limbo-fog" data-fog={mode}>
      <div className="limbo-fog-content" style={mode === 'full' ? { filter: 'saturate(.25) contrast(.9)' } : undefined}>
        {p.children}
      </div>
      {mode !== 'none' && <div className="limbo-fog-veil" aria-hidden="true" style={NO_POINTER} />}
      {mode !== 'none' && (
        <span className="limbo-fog-label" aria-hidden="true" style={NO_POINTER}>
          {mode === 'full' ? 'Offline' : `Syncing ${n}…`}
        </span>
      )}
    </div>
  );
}

/** The chip's icon follows the axis: cloud-slash (fogged), arrows (developing), check (live). */
function AxisIcon(p: { axis: 'FOGGED' | 'DEVELOPING' | 'LIVE' }): ReactNode {
  return (
    <svg {...SVG} className="limbo-icon" data-icon={p.axis === 'FOGGED' ? 'cloud-slash' : p.axis === 'DEVELOPING' ? 'arrows' : 'check'}>
      {p.axis === 'FOGGED' ? (
        <path d="M4 12h7a3 3 0 0 0 .5-6A4 4 0 0 0 4 7a2.5 2.5 0 0 0 0 5zM2 2l12 12" />
      ) : p.axis === 'DEVELOPING' ? (
        <path d="M3 6h9l-2-2M13 10H4l2 2" />
      ) : (
        <path d="M3 8.5l3.5 3.5L13 4.5" />
      )}
    </svg>
  );
}

/** One chip: icon and word for the axis, a conflict mark when twins exist, and the stalled line when an own op is stuck. */
export function StatusChip(p: { id: Id }): ReactNode {
  const { view, replica } = useLimbo(p.id);
  const stalled = replica.stalledOwn();
  const state = view.conflict === 'CONFLICT' ? 'conflict' : view.axis === 'FOGGED' ? 'offline' : view.axis === 'DEVELOPING' ? 'syncing' : 'live';
  return (
    <span className="limbo-chip" data-state={state} data-axis={view.axis}>
      <AxisIcon axis={view.axis} />
      <span className="limbo-chip-text">{view.chip}</span>
      {view.conflict === 'CONFLICT' && (
        <svg {...SVG} className="limbo-icon" data-icon="conflict">
          <path d="M2 2h8v8H2zM6 6h8v8H6z" />
        </svg>
      )}
      {stalled > 0 && <span className="limbo-chip-line">waiting for an earlier edit that was not saved</span>}
    </span>
  );
}
