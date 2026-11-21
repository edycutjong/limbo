import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../skeleton/src/limbo/tokens.css';
import '../app.css';

export const TAGLINE = 'For small teams who fill the same form when the signal is gone.';
export const DEMO_CHIP = 'DEMO DATA';
export const DEMO_NOTE = 'Demonstration data shape — not used in the field';

/** Root component: heading, tagline, and the DEMO DATA chip (a note, not dismissible). */
export function App(): ReactNode {
  return (
    <main className="as-shell">
      <h1>AFTERSHOCK</h1>
      <p>{TAGLINE}</p>
      <div className="as-chip" role="note">
        <strong>{DEMO_CHIP}</strong>
        <span>{DEMO_NOTE}</span>
      </div>
    </main>
  );
}

const el = typeof document === 'undefined' ? null : document.getElementById('root');
if (el) createRoot(el).render(<App />);
