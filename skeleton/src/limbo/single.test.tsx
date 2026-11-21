import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReplicaPair } from './pair-view.tsx';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';

const names = { a: 'SARI', b: 'DEV' };
const plate = { a: 7, b: 8 };

async function setup(search = '', onAdd = vi.fn()) {
  const pair = await makeStubPair();
  renderApp(pair, <ReplicaPair pair={pair} names={names} plate={plate} onReset={vi.fn()} onAdd={onAdd} search={search} />);
  return { pair, onAdd };
}
const cards = (): number => document.querySelectorAll('[data-replica]').length;

describe('single-replica layout', () => {
  it('narrow media gives single; wide gives the pair', async () => {
    setMedia({ narrow: true });
    const { pair } = await setup();
    expect(cards()).toBe(1);
    expect(document.querySelector('[data-replica]')?.getAttribute('data-replica')).toBe('a');
    pair.close();
  });

  it('?replicas=2 overrides narrow; ?replicas=1 overrides wide', async () => {
    setMedia({ narrow: true });
    const one = await setup('?replicas=2');
    expect(cards()).toBe(2);
    one.pair.close();
    document.body.innerHTML = '';
    setMedia({ narrow: false });
    const two = await setup('?replicas=1');
    expect(cards()).toBe(1);
    two.pair.close();
  });

  it('bar has three controls, Add calls onAdd, Try two replicas shows the pair', async () => {
    const { pair, onAdd } = await setup('?replicas=1');
    const bar = screen.getByRole('toolbar');
    expect(bar.querySelectorAll('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Inspector' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try two replicas' }));
    expect(cards()).toBe(2);
    expect(screen.queryByRole('toolbar')).toBeNull();
    pair.close();
  });

  it('fog, chip and wisps follow replica a while the peer is headless', async () => {
    const { pair } = await setup('?replicas=1');
    expect(document.querySelectorAll('[data-fog]')).toHaveLength(1);
    act(() => pair.cut());
    act(() => void pair.a.local('note.add', 'n1', {}));
    expect(document.querySelector('[data-fog]')?.getAttribute('data-fog')).toBe('full');
    expect(screen.getByText('PLATE 7 · 1 WAITING')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    pair.close();
  });

  it('Inspector lever cuts and restores', async () => {
    const { pair } = await setup('?replicas=1');
    fireEvent.click(screen.getByRole('button', { name: 'Inspector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cut link' }));
    expect(pair.view('a').link).toBe('down');
    fireEvent.click(screen.getByRole('button', { name: 'Restore link' }));
    expect(pair.view('a').link).not.toBe('down');
    await act(async () => void (await pair.settle()));
    pair.close();
  });
});
