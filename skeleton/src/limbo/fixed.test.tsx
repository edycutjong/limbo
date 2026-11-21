import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStamp } from './marks.tsx';
import { makeStubPair, renderApp } from './test/app.ts';

type P = Awaited<ReturnType<typeof makeStubPair>>;
const stamp = (c: HTMLElement): Element | null => c.querySelector('.limbo-fixed');
const sync = (pair: P) => act(async () => void (await pair.settle()));

async function fixIt(pair: P): Promise<void> {
  act(() => pair.cut());
  act(() => void pair.a.local('note.add', 'n1', {}));
  act(() => pair.restore());
  await sync(pair);
}

afterEach(() => vi.useRealTimers());

describe('FixedStamp', () => {
  it('is absent at start and shown once after cut, edit, restore, settle', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <FixedStamp id="a" />);
    expect(stamp(container)).toBeNull();
    await fixIt(pair);
    expect(stamp(container)).not.toBeNull();
    expect(container.querySelectorAll('.limbo-fixed')).toHaveLength(1);
    expect(stamp(container)!.textContent).toContain('FIXED');
    expect(stamp(container)!.getAttribute('data-fixed-count')).toBe('1');
    pair.close();
  });

  it('hides when the link is cut again', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <FixedStamp id="a" />);
    await fixIt(pair);
    act(() => pair.cut());
    expect(stamp(container)).toBeNull();
    pair.close();
  });

  it('hides when a conflict returns, and fires once when it resolves', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <FixedStamp id="a" />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await sync(pair);
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bob' });
    });
    act(() => pair.restore());
    await sync(pair);
    expect(pair.view('a').conflict).toBe('CONFLICT');
    expect(stamp(container)).toBeNull();
    const before = pair.view('a').fixedCount;
    act(() => void pair.a.local('note.delete', 'n1', {}));
    await sync(pair);
    expect(pair.view('a').conflict).toBe('CLEAR');
    expect(pair.view('a').fixedCount).toBe(before + 1);
    const el = stamp(container)!;
    expect(el.getAttribute('data-enter')).toBe('true');
    const count = el.getAttribute('data-fixed-count');
    await sync(pair);
    expect(stamp(container)).toBe(el);
    expect(el.getAttribute('data-fixed-count')).toBe(count);
    expect(el.getAttribute('data-enter')).toBe('true');
    pair.close();
  });

  it('is not driven by a JS timer', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <FixedStamp id="a" />);
    await fixIt(pair);
    vi.useFakeTimers();
    const html = container.innerHTML;
    act(() => void vi.advanceTimersByTime(5000));
    expect(stamp(container)).not.toBeNull();
    expect(container.innerHTML).toBe(html);
    pair.close();
  });
});
