import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app.css';

export const TAGLINE = 'For people whose shared list breaks when the signal does.';

/** Root component. Task 11 grows this into the pair, shell and views. */
export function App() {
  return (
    <main className="bc-shell">
      <h1>BASECAMP</h1>
      <p>{TAGLINE}</p>
    </main>
  );
}

const root = typeof document === 'undefined' ? null : document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
