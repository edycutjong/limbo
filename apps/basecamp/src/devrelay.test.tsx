import { waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { mountSolo } from './devrelay.ts';
import { SEED_ITEMS } from './seed.ts';

const closers: (() => void)[] = [];
afterEach(() => {
  closers.splice(0).forEach((c) => c());
  delete (window as unknown as { limbo?: unknown }).limbo;
});

/** In-memory relay behind a fake fetch. */
function fakeRelay(): { fetch: typeof fetch; log: Op[] } {
  const log: Op[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      const ops = JSON.parse(String(init.body)) as Op[];
      for (const o of ops) if (!log.some((x) => x.id === o.id)) log.push(o);
      return new Response(JSON.stringify({ cursor: log.length }), { status: 200 });
    }
    const since = Number(url.searchParams.get('since') ?? 0);
    return new Response(JSON.stringify({ ops: log.slice(since), cursor: log.length }), { status: 200 });
  }) as typeof fetch;
  return { fetch: f, log };
}

it('the solo page shows the list and the status line, and exposes window.limbo', async () => {
  const relay = fakeRelay();
  const el = document.createElement('div');
  document.body.append(el);
  const solo = mountSolo({ url: 'http://relay.invalid', r: 'solo-test', el, fetch: relay.fetch, pollMs: 20 });
  closers.push(() => {
    solo.close();
    el.remove();
  });
  await solo.ready;

  const rows = Array.from(el.querySelectorAll('[data-item]')).map((li) => li.textContent ?? '');
  expect(rows).toHaveLength(SEED_ITEMS.length);
  for (const it of SEED_ITEMS) expect(rows.some((t) => t.startsWith(it.name))).toBe(true);
  await waitFor(() => expect(el.querySelector('[data-status]')!.textContent).toBe('Live'));

  const limbo = (window as unknown as { limbo: Record<string, (...a: unknown[]) => unknown> }).limbo;
  expect(typeof limbo.state).toBe('function');
  expect(typeof limbo.tick).toBe('function');
  limbo.tick!('tent', true);
  await waitFor(() => expect(el.querySelector('[data-item="tent"]')!.textContent).toContain('ticked'));
  await waitFor(() => expect(relay.log.some((o) => o.op === 'item.tick')).toBe(true));
});
