import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Wisps } from './marks.tsx';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';

const q = (c: HTMLElement): number => c.querySelectorAll('.limbo-wisp-row .wisp').length;
const cross = (c: HTMLElement): number => c.querySelectorAll('.wisp-cross').length;
const count = (c: HTMLElement): string | undefined => c.querySelector('.wisp-count')?.textContent ?? undefined;
const add = (pair: Awaited<ReturnType<typeof makeStubPair>>, n: number, from = 0): void =>
  act(() => {
    for (let i = 0; i < n; i++) pair.a.local('note.add', `n${from + i}`, {});
  });

describe('Wisps', () => {
  it('shows one wisp per queued op and the exact counter', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="a" plate={7} />);
    expect(q(container)).toBe(0);
    expect(count(container)).toBeUndefined();
    act(() => pair.cut());
    add(pair, 3);
    expect(q(container)).toBe(3);
    expect(count(container)).toBe(String(pair.view('a').unacked));
    expect(count(container)).toBe('3');
    expect(container.querySelector('.limbo-plate')!.textContent).toBe('PLATE 7 · 3 WAITING');
    pair.close();
  });

  it('caps queued wisps at 12 and keeps the full count', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="a" plate={1} />);
    act(() => pair.cut());
    add(pair, 14);
    expect(q(container)).toBe(12);
    expect(count(container)).toBe('14');
    pair.close();
  });

  it('plays k crossing wisps on delivery, none for a no-op resend', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="b" plate={2} />);
    act(() => pair.cut());
    add(pair, 3);
    expect(cross(container)).toBe(0);
    act(() => pair.restore());
    await act(async () => {
      await pair.settle();
    });
    expect(cross(container)).toBe(3);
    expect(q(container)).toBe(0);
    const seq = container.querySelector('.limbo-cross-row')!.getAttribute('data-seq');
    await act(async () => {
      await pair.settle();
    });
    expect(container.querySelector('.limbo-cross-row')!.getAttribute('data-seq')).toBe(seq);
    expect(cross(container)).toBe(3);
    pair.close();
  });

  it('caps crossing wisps at 12', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="b" plate={2} />);
    act(() => pair.cut());
    add(pair, 15);
    act(() => pair.restore());
    await act(async () => {
      await pair.settle();
    });
    expect(cross(container)).toBe(12);
    pair.close();
  });

  it('renders the counter and no wisps under reduced motion', async () => {
    setMedia({ reduce: true });
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="a" plate={3} />);
    act(() => pair.cut());
    add(pair, 4);
    expect(count(container)).toBe('4');
    expect(q(container)).toBe(0);
    act(() => pair.restore());
    await act(async () => {
      await pair.settle();
    });
    expect(cross(container)).toBe(0);
    pair.close();
    setMedia({ reduce: false });
  });
});
