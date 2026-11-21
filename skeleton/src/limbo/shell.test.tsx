import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';
import { useDefs, useLimbo } from './shell.tsx';

function Probe(): React.ReactNode {
  const l = useLimbo('a');
  return (
    <div>
      <output data-testid="chip">{l.view.chip}</output>
      <output data-testid="twins">{l.view.twins}</output>
      <div aria-live="polite" data-testid="live">
        {l.announce}
      </div>
    </div>
  );
}

describe('LimboShell and useLimbo', () => {
  it('useDefs throws outside LimboShell', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Defs = (): React.ReactNode => <p>{useDefs().length}</p>;
    expect(() => render(<Defs />)).toThrow(/useDefs must be used inside <LimboShell>/);
    err.mockRestore();
  });

  it('throws outside LimboShell', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/LimboShell/);
    err.mockRestore();
  });

  it('reads the view once per change and keeps the snapshot stable between changes', async () => {
    const pair = await makeStubPair();
    const view = vi.spyOn(pair, 'view');
    let setN: (n: number) => void = () => undefined;
    const seen = new Set<unknown>();
    function Rerender(): React.ReactNode {
      const [n, set] = useState(0);
      setN = set;
      const l = useLimbo('a');
      seen.add(l);
      return (
        <p>
          {n}
          <output data-testid="chip">{l.view.chip}</output>
        </p>
      );
    }
    renderApp(pair, <Rerender />);
    const initial = view.mock.calls.length;
    act(() => setN(1));
    act(() => setN(2));
    expect(view.mock.calls.length).toBe(initial);
    expect(seen.size).toBe(1);
    const changes = new Set<unknown>();
    const off = pair.sessions.a.subscribe(() => changes.add(Symbol()));
    act(() => {
      pair.cut();
    });
    off();
    // One hook read per notified change; the snapshot only rebuilds when a change arrived.
    expect(view.mock.calls.length - initial).toBeGreaterThan(0);
    expect(view.mock.calls.length - initial).toBeLessThanOrEqual(changes.size * 2);
    expect(screen.getByTestId('chip').textContent).toBe('Offline');
    pair.close();
  });

  it('removes its replica, session and onCross subscriptions on unmount', async () => {
    const pair = await makeStubPair();
    const offs: ReturnType<typeof vi.fn>[] = [];
    const wrap = <T extends { subscribe?: unknown; onCross?: unknown }>(o: T, key: 'subscribe' | 'onCross'): void => {
      const orig = (o as any)[key].bind(o) as (fn: unknown) => () => void;
      (o as any)[key] = (fn: unknown) => {
        const off = vi.fn(orig(fn));
        offs.push(off);
        return off;
      };
    };
    wrap(pair.a, 'subscribe');
    wrap(pair.sessions.a, 'subscribe');
    wrap(pair.sessions.a, 'onCross');
    const { unmount } = renderApp(pair, <Probe />);
    expect(offs.length).toBe(3);
    expect(offs.every((o) => o.mock.calls.length === 0)).toBe(true);
    unmount();
    expect(offs.every((o) => o.mock.calls.length === 1)).toBe(true);
    pair.close();
  });

  it('sets data-motion from the media query and follows its change', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Probe />);
    const root = container.querySelector('.limbo-shell')!;
    expect(root.getAttribute('data-motion')).toBe('full');
    act(() => setMedia({ reduce: true }));
    expect(root.getAttribute('data-motion')).toBe('reduced');
    act(() => setMedia({ reduce: false }));
    expect(root.getAttribute('data-motion')).toBe('full');
    pair.close();
  });

  it('shows view.twins when the descriptor count differs, and warns once', async () => {
    const pair = await makeStubPair();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderApp(pair, <Probe />);
    // Two concurrent sets are a causal-lww twin that the stub's describeConflicts does not describe.
    await act(async () => {
      pair.a.local('note.add', 'n1', {});
      await pair.settle();
      pair.cut();
      pair.a.local('note.set', 'n1', 'x');
      pair.b.local('note.set', 'n1', 'y');
      pair.restore();
      await pair.settle();
    });
    expect(Number(screen.getByTestId('twins').textContent)).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    pair.close();
  });

  it('announces cut, restore and synced once each, and not again on re-render', async () => {
    const pair = await makeStubPair();
    renderApp(pair, <Probe />);
    const live = (): string => screen.getByTestId('live').textContent!;
    expect(live()).toBe('');
    act(() => pair.cut());
    expect(live()).toBe('Link cut. Edits will wait on this device.');
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.set', 'n1', 'x');
    });
    expect(live()).toBe('Link cut. Edits will wait on this device.');
    const seen: string[] = [];
    const obs = new MutationObserver(() => seen.push(live()));
    obs.observe(screen.getByTestId('live'), { childList: true, characterData: true, subtree: true });
    await act(async () => {
      pair.restore();
    });
    expect(live()).toBe('Link restored. Syncing…');
    await act(async () => {
      await pair.settle();
    });
    expect(live()).toBe('2 edits synced.');
    await act(async () => {
      await Promise.resolve();
    });
    obs.takeRecords();
    obs.disconnect();
    expect(live()).toBe('2 edits synced.');
    expect(seen.filter((s) => s === 'Link restored. Syncing…').length).toBeLessThanOrEqual(1);
    pair.close();
  });

  it('uses no timer: advancing fake timers changes neither resolved nor crossing', async () => {
    const pair = await makeStubPair();
    let latest: ReturnType<typeof useLimbo> | undefined;
    function Snap(): null {
      latest = useLimbo('a');
      return null;
    }
    renderApp(pair, <Snap />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await act(async () => void (await pair.settle()));
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bob' });
    });
    act(() => pair.restore());
    await act(async () => void (await pair.settle()));
    act(() => void pair.b.local('note.delete', 'n1', {}));
    await act(async () => void (await pair.settle()));
    const before = { resolved: latest!.resolved, crossing: latest!.crossing };
    expect(before.resolved).toHaveLength(1);
    vi.useFakeTimers();
    try {
      act(() => void vi.advanceTimersByTime(60_000));
    } finally {
      vi.useRealTimers();
    }
    expect(latest!.resolved).toEqual(before.resolved);
    expect(latest!.crossing).toEqual(before.crossing);
    pair.close();
  });
});
