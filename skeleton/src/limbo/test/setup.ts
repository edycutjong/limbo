// Setup for the `limbo` Vitest project (jsdom). Test code: not part of the skeleton budget.
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// CSS: Vitest replaces plain `.css` imports with an empty module (its default `css.include` is empty),
// so `import './tokens.css'` is a no-op here. Tests that need the stylesheet text read the file directly.

type Listener = (e: { matches: boolean }) => void;

/** The media-query state the stub reports. Tests set `reduce` / `narrow` with `setMedia`. */
export const media = { reduce: false, narrow: false };
const watchers = new Set<{ query: string; fn: Listener }>();

const matches = (query: string): boolean =>
  query.includes('prefers-reduced-motion') ? media.reduce : query.includes('max-width: 639px') ? media.narrow : false;

export function setMedia(next: Partial<typeof media>): void {
  Object.assign(media, next);
  for (const w of [...watchers]) w.fn({ matches: matches(w.query) });
}

window.matchMedia = ((query: string) => ({
  media: query,
  get matches() {
    return matches(query);
  },
  onchange: null,
  addEventListener: (_: string, fn: Listener) => void watchers.add({ query, fn }),
  removeEventListener: (_: string, fn: Listener) => {
    for (const w of watchers) if (w.fn === fn && w.query === query) watchers.delete(w);
  },
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

beforeEach(() => {
  media.reduce = false;
  media.narrow = false;
  watchers.clear();
});
afterEach(() => cleanup());
