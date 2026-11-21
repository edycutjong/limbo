import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Fog } from './marks.tsx';
import { makeStubPair, renderApp } from './test/app.ts';

const ui = (
  <Fog id="a">
    <p>content</p>
  </Fog>
);
const mode = (c: HTMLElement): string | null => c.querySelector('.limbo-fog')!.getAttribute('data-fog');
const label = (c: HTMLElement): string | undefined => c.querySelector('.limbo-fog-label')?.textContent ?? undefined;

describe('Fog', () => {
  it('is none while live', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, ui);
    expect(mode(container)).toBe('none');
    expect(container.querySelector('.limbo-fog-veil')).toBeNull();
    pair.close();
  });

  it('cut gives full fog, label Offline, desaturated content, and a veil with pointer-events none and aria-hidden', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, ui);
    act(() => pair.cut());
    expect(mode(container)).toBe('full');
    expect(label(container)).toBe('Offline');
    expect(container.querySelector<HTMLElement>('.limbo-fog-content')!.style.filter).toContain('saturate');
    const veil = container.querySelector<HTMLElement>('.limbo-fog-veil')!;
    expect(veil.getAttribute('aria-hidden')).toBe('true');
    expect(veil.style.pointerEvents).toBe('none');
    pair.close();
  });

  it('connecting is also full fog', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, ui);
    act(() => pair.cut());
    act(() => pair.restore());
    expect(pair.view('a').link).toBe('connecting');
    expect(mode(container)).toBe('full');
    pair.close();
  });

  it('haze reads Syncing n… with n = unacked + behind before settle, and none after', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, ui);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.add', 'n1', {});
      pair.a.local('note.add', 'n2', {});
    });
    act(() => pair.restore());
    act(() => void pair.link.pump());
    act(() => void pair.link.pump());
    const v = pair.view('a');
    expect(v.link).toBe('up');
    expect(v.unacked + v.behind).toBe(2);
    expect(mode(container)).toBe('haze');
    expect(label(container)).toBe('Syncing 2…');
    expect(container.querySelector<HTMLElement>('.limbo-fog-content')!.style.filter).toBe('');
    await act(async () => {
      await pair.settle();
    });
    expect(mode(container)).toBe('none');
    pair.close();
  });

  it('buffered-only gives haze labelled Syncing…, following the chip axis', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, ui);
    // a peer-authored op whose predecessor never arrived: held, not unacked, not behind
    act(() => {
      pair.a.receive([{ id: 'b#9:2', op: 'note.add', target: 'z', payload: {}, stamp: { l: 5, r: 'b#9', n: 2 }, deps: { 'b#9': 1 } }]);
    });
    const v = pair.view('a');
    expect([v.unacked, v.behind, v.buffered]).toEqual([0, 0, 1]);
    expect(v.axis).toBe('DEVELOPING');
    expect(mode(container)).toBe('haze');
    expect(label(container)).toBe('Syncing…');
    pair.close();
  });
});
