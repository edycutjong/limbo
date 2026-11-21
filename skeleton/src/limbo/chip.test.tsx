import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusChip } from './marks.tsx';
import { makeStubPair, renderApp } from './test/app.ts';

const text = (c: HTMLElement): string => c.querySelector('.limbo-chip-text')!.textContent!;
const icons = (c: HTMLElement): string[] => Array.from(c.querySelectorAll('.limbo-chip [data-icon]')).map((e) => e.getAttribute('data-icon')!);

describe('StatusChip', () => {
  it('shows the five strings exactly, each with a word and an icon', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <StatusChip id="a" />);
    const seen: [string, string][] = [];
    const take = (): void => void seen.push([text(container), icons(container)[0]!]);
    take(); // Live
    act(() => pair.cut());
    take(); // Offline
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.add', 'n2', {});
    });
    take(); // Offline — 2 waiting
    act(() => pair.restore());
    act(() => void pair.link.pump());
    act(() => void pair.link.pump());
    take(); // Syncing 2…
    await act(async () => {
      await pair.settle();
    });
    act(() => {
      pair.a.receive([{ id: 'b#9:2', op: 'note.add', target: 'z', payload: {}, stamp: { l: 9, r: 'b#9', n: 2 }, deps: { 'b#9': 1 } }]);
    });
    take(); // Syncing…
    expect(seen.map((s) => s[0])).toEqual(['Live', 'Offline', 'Offline — 2 waiting', 'Syncing 2…', 'Syncing…']);
    expect(seen.map((s) => s[1])).toEqual(['check', 'cloud-slash', 'cloud-slash', 'arrows', 'arrows']);
    for (const [word, icon] of seen) {
      expect(word.length).toBeGreaterThan(0);
      expect(icon.length).toBeGreaterThan(0);
    }
    pair.close();
  });

  it('adds a conflict mark and count when twins exist', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <StatusChip id="a" />);
    pair.a.local('note.add', 'n1', {});
    await act(async () => {
      await pair.settle();
    });
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bo' });
    });
    act(() => pair.restore());
    await act(async () => {
      await pair.settle();
    });
    expect(text(container)).toBe('Live · 1 conflict');
    expect(icons(container)).toEqual(['check', 'conflict']);
    expect(container.querySelector('.limbo-chip')!.getAttribute('data-state')).toBe('conflict');
    pair.close();
  });

  it('adds the stalled line when an earlier own edit was not saved', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <StatusChip id="a" />);
    expect(container.querySelector('.limbo-chip-line')).toBeNull();
    act(() => {
      pair.a.receive([{ id: 'a#0:3', op: 'note.add', target: 'z', payload: {}, stamp: { l: 5, r: 'a#0', n: 3 }, deps: { 'a#0': 2 } }]);
    });
    expect(pair.a.stalledOwn()).toBe(1);
    expect(container.querySelector('.limbo-chip-line')!.textContent).toBe('waiting for an earlier edit that was not saved');
    pair.close();
  });
});
