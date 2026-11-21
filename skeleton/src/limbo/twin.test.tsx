import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Twin } from './twin.tsx';
import { useLimbo } from './shell.tsx';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';

type P = Awaited<ReturnType<typeof makeStubPair>>;

function Rows(p: { onKeep(): void; onOther(): void }) {
  const { conflicts } = useLimbo('a');
  return (
    <>
      {conflicts.length === 0 && <div data-limbo-row="">plain row</div>}
      {conflicts.map((d) => (
        <Twin
          key={d.id}
          replica="a"
          id={d.id}
          atRest={<span>at rest {d.target}</span>}
          ghost={<span>ghost {d.target}</span>}
          caption={d.caption}
          rule={d.rule}
          actions={
            <>
              <button onClick={p.onKeep}>Keep</button>
              <button onClick={p.onOther}>Other</button>
            </>
          }
        />
      ))}
    </>
  );
}

const sync = (pair: P) => act(async () => void (await pair.settle()));

async function setup(kind: 'life' | 'claim') {
  const pair = await makeStubPair();
  const keep = vi.fn();
  const other = vi.fn();
  const r = renderApp(pair, <Rows onKeep={keep} onOther={other} />);
  act(() => void pair.a.local('note.add', 'n1', {}));
  await sync(pair);
  act(() => pair.cut());
  act(() => {
    if (kind === 'life') {
      pair.a.local('note.set', 'n1', 'edited');
      pair.b.local('note.delete', 'n1', {});
    } else {
      pair.a.local('note.claim', 'n1', { who: 'ann' });
      pair.b.local('note.claim', 'n1', { who: 'bob' });
    }
  });
  act(() => pair.restore());
  await sync(pair);
  return { pair, keep, other, ...r };
}

describe('Twin', () => {
  for (const kind of ['life', 'claim'] as const) {
    it(`renders on the same row after a real ${kind} conflict`, async () => {
      const { container, pair } = await setup(kind);
      expect(pair.view('a').twins).toBeGreaterThan(0);
      expect(container.querySelectorAll('[data-limbo-row]')).toHaveLength(1);
      expect(container.querySelector('.limbo-twin')).not.toBeNull();
      expect(container.textContent).toContain('TWIN');
      const rule = container.querySelector('.limbo-twin-rule')!.textContent;
      expect(rule).toBe(kind === 'life' ? 'Decided by: resurrect' : 'Decided by: claim-one');
      pair.close();
    });
  }

  it('keeps the ghost decorative and offset, and caption and buttons out of the faded layer', async () => {
    const { container, pair } = await setup('life');
    const ghost = container.querySelector<HTMLElement>('.limbo-twin-ghost')!;
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.style.transform).toBe('translate(6px, 6px)');
    expect(ghost.style.opacity).toBe('0.7');
    for (const el of Array.from(container.querySelectorAll('.limbo-twin-caption, .limbo-twin-rule, .limbo-twin-actions, button, .limbo-twin-label'))) {
      expect(ghost.contains(el)).toBe(false);
    }
    expect(container.querySelector('.limbo-twin-caption')!.textContent).toBe('Edited and deleted');
    pair.close();
  });

  it('Enter on the focused twin triggers the first button only', async () => {
    const { container, keep, other, pair } = await setup('life');
    const row = container.querySelector<HTMLElement>('.limbo-twin')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(keep).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    pair.close();
  });

  it('removes the twin after resolve and never shows a resolved conflict', async () => {
    const { container, pair } = await setup('life');
    act(() => void pair.a.local('note.restore', 'n1', {}));
    await sync(pair);
    expect(pair.view('a').twins).toBe(0);
    const ghost = container.querySelector('.limbo-twin-ghost');
    if (ghost) {
      expect(container.querySelector('.limbo-twin')!.getAttribute('data-leaving')).toBe('true');
      fireEvent.animationEnd(ghost);
    }
    expect(container.querySelector('.limbo-twin')).toBeNull();
    expect(container.textContent).not.toContain('TWIN');
    expect(container.textContent).toContain('plain row');
    pair.close();
  });

  it('claim loser twin goes away once the item is deleted (superseded)', async () => {
    const { container, pair } = await setup('claim');
    act(() => void pair.a.local('note.delete', 'n1', {}));
    await sync(pair);
    const ghost = container.querySelector('.limbo-twin-ghost');
    if (ghost) fireEvent.animationEnd(ghost);
    expect(container.querySelector('.limbo-twin')).toBeNull();
    pair.close();
  });

  it('unmounts at once with reduced motion and never carries a leaving class', async () => {
    setMedia({ reduce: true });
    const { container, pair } = await setup('life');
    expect(container.querySelector('.limbo-twin')!.className).not.toMatch(/enter|leaving/);
    act(() => void pair.a.local('note.restore', 'n1', {}));
    await sync(pair);
    expect(container.querySelector('.limbo-twin')).toBeNull();
    expect(container.querySelector('[data-leaving]')).toBeNull();
    pair.close();
  });
});
