import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inspector } from './inspector.tsx';
import { LimboShell, useLimbo } from './shell.tsx';
import { createPair } from '../sync/pair.ts';
import { openStore } from '../sync/store.ts';
import type { Op } from '../core/types.ts';
import { defs as stubDefs, describeConflicts, makeStubPair, materialize, renderApp, twinCount } from './test/app.ts';

type P = Awaited<ReturnType<typeof makeStubPair>>;
const sync = (pair: P) => act(async () => void (await pair.settle()));
const section = (name: string): HTMLElement => screen.getByRole('region', { name });
const open = (): void => void fireEvent.click(screen.getByRole('button', { name: 'Inspector' }));
const rows = (el: HTMLElement): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('tbody tr'));

async function cross(pair: P, target: string): Promise<void> {
  act(() => pair.cut());
  act(() => void pair.a.local('note.add', target, {}));
  act(() => pair.restore());
  await sync(pair);
}

describe('Inspector', () => {
  it('opens and closes with the button and Escape, and focus returns', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    const btn = screen.getByRole('button', { name: 'Inspector' });
    expect(screen.queryByRole('dialog')).toBeNull();
    btn.focus();
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
    pair.close();
  });

  it('traps focus with Tab', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    open();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toBe(document.activeElement);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
    pair.close();
  });

  it('shows link state, peer id, and empty sections in words', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    open();
    expect(section('Link').textContent).toContain(`Link: ${pair.view('a').link}`);
    expect(section('Queued ops').textContent).toContain('No queued ops.');
    expect(section('Recent exchanges').textContent).toContain('No exchanges yet.');
    expect(section('Conflicts').textContent).toContain('No conflicts.');
    act(() => pair.cut());
    expect(section('Link').textContent).toContain('Link: down');
    await sync(pair);
    pair.close();
  });

  it('lists queued ops equal to view.unacked with every column', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.set', 'n1', 'hello');
    });
    open();
    const list = rows(section('Queued ops'));
    expect(list).toHaveLength(pair.view('a').unacked);
    expect(list).toHaveLength(2);
    const q = pair.queued('a');
    q.forEach((o, i) => {
      const cells = Array.from(list[i]!.querySelectorAll('td')).map((c) => c.textContent);
      expect(cells[0]).toBe(o.op);
      expect(cells[1]).toBe(o.target);
      expect(cells[4]).toBe(`${o.stamp.l}·${o.stamp.r}·${o.stamp.n}`);
    });
    const text = list.map((r) => r.textContent).join('|');
    expect(text).toContain('commutes');
    expect(text).toContain('create');
    expect(text).toContain('causal-lww');
    expect(text).toContain('set text');
    pair.close();
  });

  it('shows deps in the deps column', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.set', 'n1', 'x');
    });
    open();
    const second = pair.queued('a')[1]!;
    const dep = Object.entries(second.deps)
      .map(([r, n]) => `${r}:${n}`)
      .join(' ');
    expect(dep).not.toBe('');
    expect(rows(section('Queued ops'))[1]!.textContent).toContain(dep);
    pair.close();
  });

  it('shows exchanges newest first, last 3 only, with in/out and the same columns', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    for (const t of ['n1', 'n2', 'n3', 'n4']) await cross(pair, t);
    open();
    const tables = Array.from(section('Recent exchanges').querySelectorAll('table'));
    expect(tables).toHaveLength(3);
    expect(tables[0]!.textContent).toContain('n4');
    expect(tables[2]!.textContent).toContain('n2');
    expect(section('Recent exchanges').textContent).not.toContain('n1');
    const head = Array.from(tables[0]!.querySelectorAll('th')).map((h) => h.textContent);
    expect(head).toEqual(['dir', 'op', 'target', 'merge', 'intent', 'stamp', 'deps']);
    const cells = Array.from(rows(tables[0]!)[0]!.querySelectorAll('td')).map((c) => c.textContent);
    expect(cells[0]).toBe('out');
    expect(cells[1]).toBe('note.add');
    expect(cells[3]).toBe('commutes');
    expect(cells[4]).toBe('create');
    pair.close();
  });

  it('keeps a resolved conflict until the next crossing, then drops it', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await sync(pair);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bob' });
    });
    act(() => pair.restore());
    await sync(pair);
    open();
    const live = section('Conflicts');
    expect(live.textContent).toContain('rule: claim-one');
    expect(live.querySelector('[data-resolved]')).toBeNull();
    act(() => void pair.a.local('note.delete', 'n1', {}));
    await sync(pair);
    expect(pair.view('a').conflict).toBe('CLEAR');
    expect(section('Conflicts').querySelector('[data-resolved]')?.textContent).toContain('resolved');
    act(() => void pair.b.local('note.add', 'n2', {}));
    await sync(pair);
    expect(section('Conflicts').querySelector('[data-resolved]')).toBeNull();
    expect(section('Conflicts').textContent).toContain('No conflicts.');
    pair.close();
  });

  it('lists a conflict that an incoming op resolved, then drops it at the next crossing', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await sync(pair);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bob' });
    });
    act(() => pair.restore());
    await sync(pair);
    open();
    expect(section('Conflicts').textContent).toContain('rule: claim-one');
    expect(section('Conflicts').querySelector('[data-resolved]')).toBeNull();
    act(() => void pair.b.local('note.delete', 'n1', {}));
    await sync(pair);
    expect(pair.view('a').conflict).toBe('CLEAR');
    const resolved = section('Conflicts').querySelectorAll('[data-resolved]');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.textContent).toContain('claim-one');
    expect(resolved[0]!.textContent).toContain('resolved');
    act(() => void pair.b.local('note.add', 'n2', {}));
    await sync(pair);
    expect(section('Conflicts').querySelector('[data-resolved]')).toBeNull();
    expect(section('Conflicts').textContent).toContain('No conflicts.');
    pair.close();
  });

  it('lists only the incoming resolve after a local resolve in the previous crossing', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.add', 'n2', {});
    });
    await sync(pair);
    act(() => pair.cut());
    act(() => {
      for (const t of ['n1', 'n2']) {
        pair.a.local('note.claim', t, { who: 'ann' });
        pair.b.local('note.claim', t, { who: 'bob' });
      }
    });
    act(() => pair.restore());
    await sync(pair);
    open();
    expect(section('Conflicts').textContent).toContain('n1');
    act(() => void pair.a.local('note.delete', 'n1', {}));
    await sync(pair);
    expect(section('Conflicts').querySelectorAll('[data-resolved]')).toHaveLength(1);
    act(() => void pair.b.local('note.delete', 'n2', {}));
    await sync(pair);
    const resolved = section('Conflicts').querySelectorAll('[data-resolved]');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.textContent).toContain('n2');
    act(() => void pair.b.local('note.add', 'n3', {}));
    await sync(pair);
    expect(section('Conflicts').querySelector('[data-resolved]')).toBeNull();
    pair.close();
  });

  it('keeps a re-twinned Keep and Delete as an open twin, not resolved', async () => {
    const pair = await makeStubPair();
    let latest: ReturnType<typeof useLimbo> | undefined;
    function Probe(): null {
      latest = useLimbo('a');
      return null;
    }
    renderApp(pair, <Probe />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await sync(pair);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.delete', 'n1', {});
      pair.b.local('note.restore', 'n1', {});
    });
    act(() => pair.restore());
    await sync(pair);
    expect(latest!.view.twins).toBe(1);
    expect(latest!.conflicts).toHaveLength(1);
    expect(latest!.resolved).toHaveLength(0);
    pair.close();
  });

  it('shows replica id, vv and log size', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await sync(pair);
    open();
    const r = section('Replica').textContent!;
    expect(r).toContain(`Replica: ${pair.a.id}`);
    for (const [k, n] of Object.entries(pair.a.vv())) expect(r).toContain(`${k}:${n}`);
    expect(r).toContain(`Log size: ${pair.a.log().length}`);
    pair.close();
  });

  it('shows unknown for an op with no def', async () => {
    const pair = await makeStubPair();
    render(
      <LimboShell pair={pair} defs={[]} describeConflicts={describeConflicts}>
        <Inspector id="a" />
      </LimboShell>,
    );
    act(() => pair.cut());
    act(() => void pair.a.local('note.add', 'n1', {}));
    open();
    const cells = Array.from(rows(section('Queued ops'))[0]!.querySelectorAll('td')).map((c) => c.textContent);
    expect(cells[2]).toBe('unknown');
    expect(cells[3]).toBe('unknown');
    expect(within(section('Queued ops')).getAllByText('unknown').length).toBeGreaterThan(0);
    pair.close();
  });

  describe('Rejected ops', () => {
    const op = (n: number, name: string): Op => ({ id: `z:${n}`, op: name, target: 't', payload: {}, stamp: { l: 1, r: 'z', n }, deps: {} });

    it('shows an empty line, then live rows for malformed and unknown-op ops', async () => {
      const pair = await makeStubPair();
      renderApp(pair, <Inspector id="a" />);
      open();
      expect(section('Rejected ops').textContent).toContain('No rejected ops.');
      act(() => void pair.a.receive([{ ...op(1, 'note.add'), deps: null } as unknown as Op, op(2, 'nope.op')]));
      const list = rows(section('Rejected ops'));
      expect(list.map((r) => r.textContent)).toEqual(['z:1malformed', 'z:2unknown-op']);
      expect(section('Rejected ops').querySelector('table')?.getAttribute('aria-label')).toBe('Rejected ops');
      pair.close();
    });

    it('shows store-failed after a failed put', async () => {
      const pair = await createPair({
        app: 'stub-rej',
        defs: stubDefs,
        materialize,
        twinCount,
        seedOps: [],
        schedule: () => undefined,
        store: (name) => ({ ...openStore(name), put: () => Promise.reject(new Error('disk')) }),
      });
      renderApp(pair, <Inspector id="a" />);
      open();
      let made!: Op;
      act(() => void (made = pair.a.local('note.add', 'n1', {})));
      await act(async () => void (await Promise.resolve()));
      expect(rows(section('Rejected ops')).map((r) => r.textContent)).toEqual([`${made.id}store-failed`]);
      pair.close();
    });

    it('follows replica.rejected() order, stops at 50, and keeps Escape and the focus trap', async () => {
      const pair = await makeStubPair();
      renderApp(pair, <Inspector id="a" />);
      open();
      act(() => void pair.a.receive(Array.from({ length: 60 }, (_, i) => op(i + 1, 'nope.op'))));
      const list = rows(section('Rejected ops'));
      expect(list).toHaveLength(50);
      expect(list.map((r) => r.querySelector('td')?.textContent)).toEqual(pair.a.rejected().map((r) => r.id));
      const close = screen.getByRole('button', { name: 'Close' });
      fireEvent.keyDown(close, { key: 'Tab' });
      expect(document.activeElement).toBe(close);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      pair.close();
    });
  });
});

describe('Inspector coverage', () => {
  it('says none yet while the session has no peer id', async () => {
    const pair = await makeStubPair();
    const noPeer = { ...pair, sessions: { ...pair.sessions, a: { ...pair.sessions.a, peerId: () => undefined } } } as typeof pair;
    renderApp(noPeer, <Inspector id="a" />);
    open();
    expect(section('Link').textContent).toContain('Peer: none yet');
    pair.close();
  });

  it('says no ops crossed for an exchange that carried none', async () => {
    const pair = await makeStubPair();
    const empty = { ...pair, exchanges: () => ({ last: [[]], open: [] }) } as unknown as typeof pair;
    renderApp(empty, <Inspector id="a" />);
    open();
    const recent = section('Recent exchanges');
    expect(recent.textContent).toContain('No ops crossed.');
    expect(recent.querySelector('table')).toBeNull();
    pair.close();
  });

  it('labels ops that this replica received as in', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Inspector id="a" />);
    act(() => void pair.b.local('note.add', 'n1', {}));
    await sync(pair);
    open();
    const cells = Array.from(rows(section('Recent exchanges'))[0]!.querySelectorAll('td')).map((c) => c.textContent);
    expect(cells[0]).toBe('in');
    expect(cells[1]).toBe('note.add');
    pair.close();
  });

  describe('focus trap with a second focusable', () => {
    const setup = async () => {
      const pair = await makeStubPair();
      renderApp(pair, <Inspector id="a" lever={<button type="button">Lever</button>} />);
      open();
      const close = screen.getByRole('button', { name: 'Close' });
      const lever = screen.getByRole('button', { name: 'Lever' });
      return { pair, close, lever, dialog: screen.getByRole('dialog') };
    };

    it('Tab from outside the drawer moves focus to the first focusable', async () => {
      const { pair, close, dialog } = await setup();
      screen.getByRole('button', { name: 'Inspector' }).focus();
      expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false);
      expect(document.activeElement).toBe(close);
      pair.close();
    });

    it('Shift+Tab from outside the drawer moves focus to the last focusable', async () => {
      const { pair, lever, dialog } = await setup();
      screen.getByRole('button', { name: 'Inspector' }).focus();
      expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(lever);
      pair.close();
    });

    it('Tab on the last focusable wraps to the first, Shift+Tab on the first wraps to the last', async () => {
      const { pair, close, lever, dialog } = await setup();
      lever.focus();
      expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false);
      expect(document.activeElement).toBe(close);
      expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(lever);
      pair.close();
    });

    it('Tab between the two focusables is left to the browser', async () => {
      const { pair, close, lever, dialog } = await setup();
      close.focus();
      expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true);
      lever.focus();
      expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })).toBe(true);
      pair.close();
    });
  });
});
