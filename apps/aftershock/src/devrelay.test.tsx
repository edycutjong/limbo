import { waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { mountSolo } from './devrelay.ts';

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

type Limbo = {
  report(s: string, v: string): unknown;
  count(s: string, n: number): unknown;
  note(s: string, t: string): unknown;
  state(): string;
};
const limboOf = (): Limbo => (window as unknown as { limbo: Limbo }).limbo;

function mount(relay: ReturnType<typeof fakeRelay>, r: string): { el: HTMLElement; ready: Promise<void> } {
  const el = document.createElement('div');
  document.body.append(el);
  const solo = mountSolo({ url: 'http://relay.invalid', r, el, fetch: relay.fetch, pollMs: 20 });
  closers.push(() => {
    solo.close();
    el.remove();
  });
  return { el, ready: solo.ready };
}

it('the solo page shows status and a sector line, and exposes window.limbo', async () => {
  const relay = fakeRelay();
  const { el, ready } = mount(relay, 'a');
  await ready;
  await waitFor(() => expect(el.querySelector('[data-status]')!.textContent).toBe('Live'));
  const limbo = limboOf() as unknown as Record<string, unknown>;
  for (const k of ['report', 'count', 'note', 'state', 'ops', 'queued']) expect(typeof limbo[k]).toBe('function');

  limboOf().report('C3', 'damaged');
  await waitFor(() => expect(el.querySelector('[data-sector="C3"]')!.textContent).toContain('damaged'));
  await waitFor(() => expect(relay.log.some((o) => o.op === 'sector.report')).toBe(true));
});

it('two solo replicas over one fake relay converge on C3 unsafe with both counts', async () => {
  const relay = fakeRelay();
  const a = mount(relay, 'a');
  await a.ready;
  const limboA = limboOf();
  const b = mount(relay, 'b');
  await b.ready;
  const limboB = limboOf();

  limboA.report('C3', 'damaged');
  limboA.count('C3', 2);
  limboB.report('C3', 'unsafe');
  limboB.count('C3', 3);

  await waitFor(() => expect(limboA.state()).toBe(limboB.state()), { timeout: 3000 });
  for (const el of [a.el, b.el]) {
    const line = el.querySelector('[data-sector="C3"]')!.textContent ?? '';
    expect(line).toContain('unsafe');
    expect(line).toContain('sari 2');
    expect(line).toContain('budi 3');
  }
});
