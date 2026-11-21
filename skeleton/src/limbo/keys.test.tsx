import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReplicaPair } from './pair-view.tsx';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';

const names = { a: 'SARI', b: 'DEV' };
const plate = { a: 7, b: 8 };

async function setup(search: string, rows = false) {
  const pair = await makeStubPair();
  renderApp(
    pair,
    <>
      <ReplicaPair pair={pair} names={names} plate={plate} onReset={vi.fn()} onAdd={vi.fn()} search={search} />
      {rows && (
        <>
          <div data-limbo-row="" data-testid="r1">
            one
          </div>
          <div data-limbo-row="" data-testid="r2">
            two
          </div>
          <div data-limbo-row="" data-testid="r3">
            three
          </div>
        </>
      )}
    </>,
  );
  return pair;
}
const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(el, { key, ...init });
};

describe('keyboard', () => {
  it('L cuts then restores in the pair layout', async () => {
    setMedia({ narrow: false });
    const pair = await setup('?replicas=2');
    const target = screen.getByRole('button', { name: 'Reset demo' });
    press(target, 'l');
    expect(pair.view('a').link).toBe('down');
    press(target, 'L');
    expect(pair.view('a').link).not.toBe('down');
    await act(async () => void (await pair.settle()));
    pair.close();
  });

  it('L cuts then restores in the single layout', async () => {
    const pair = await setup('?replicas=1');
    const target = screen.getByRole('button', { name: 'Add' });
    press(target, 'l');
    expect(pair.view('a').link).toBe('down');
    press(target, 'l');
    expect(pair.view('a').link).not.toBe('down');
    await act(async () => void (await pair.settle()));
    pair.close();
  });

  it('I opens and closes the Inspector drawer', async () => {
    const pair = await setup('?replicas=1');
    expect(screen.queryByRole('dialog')).toBeNull();
    press(screen.getByRole('button', { name: 'Add' }), 'i');
    expect(screen.getByRole('dialog')).toBeTruthy();
    press(document.activeElement!, 'I');
    expect(screen.queryByRole('dialog')).toBeNull();
    pair.close();
  });

  it('arrows move focus across rows and stop at the ends', async () => {
    const pair = await setup('?replicas=1', true);
    const r = (n: number): HTMLElement => screen.getByTestId(`r${n}`);
    const start = screen.getByRole('button', { name: 'Add' });
    press(start, 'ArrowDown');
    expect(document.activeElement).toBe(r(1));
    press(r(1), 'ArrowDown');
    expect(document.activeElement).toBe(r(2));
    press(r(2), 'ArrowDown');
    press(r(3), 'ArrowDown');
    expect(document.activeElement).toBe(r(3));
    press(r(3), 'ArrowUp');
    expect(document.activeElement).toBe(r(2));
    pair.close();
  });

  it('typing l or i in an input does nothing; so does Ctrl, Meta or Alt', async () => {
    const pair = await setup('?replicas=1');
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const edit = document.createElement('div');
    edit.setAttribute('contenteditable', 'true');
    const shell = document.querySelector('.limbo-shell')!;
    shell.append(input, area, edit);
    for (const el of [input, area, edit]) {
      press(el, 'l');
      press(el, 'i');
    }
    expect(pair.view('a').link).not.toBe('down');
    expect(screen.queryByRole('dialog')).toBeNull();
    const add = screen.getByRole('button', { name: 'Add' });
    press(add, 'l', { ctrlKey: true });
    press(add, 'l', { metaKey: true });
    press(add, 'l', { altKey: true });
    press(add, 'i', { ctrlKey: true });
    expect(pair.view('a').link).not.toBe('down');
    expect(screen.queryByRole('dialog')).toBeNull();
    pair.close();
  });

  it('an app row can bind Space and Delete itself using data-limbo-row', async () => {
    const pair = await makeStubPair();
    pair.a.local('note.add', 'n1', {});
    await pair.settle();
    renderApp(
      pair,
      <div
        data-limbo-row=""
        data-testid="row"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ') pair.a.local('note.set', 'n1', 'ticked');
          else if (e.key === 'Delete') pair.a.local('note.delete', 'n1', {});
        }}
      >
        n1
      </div>,
    );
    const row = screen.getByTestId('row');
    row.focus();
    expect(document.activeElement).toBe(row);
    press(row, ' ');
    await act(async () => void (await pair.settle()));
    expect(pair.a.state().notes[0]?.text).toBe('ticked');
    press(row, 'Delete');
    await act(async () => void (await pair.settle()));
    expect(pair.a.state().notes[0]?.life).toBe('deleted');
    expect(pair.b.state().notes[0]?.life).toBe('deleted');
    pair.close();
  });

  it('arrows leave the key alone when the shell has no rows', async () => {
    const pair = await setup('?replicas=1');
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    expect(fireEvent.keyDown(add, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(add, { key: 'ArrowUp' })).toBe(true);
    expect(document.activeElement).toBe(add);
    pair.close();
  });

  it('ArrowUp from outside the rows lands on the last row', async () => {
    const pair = await setup('?replicas=1', true);
    press(screen.getByRole('button', { name: 'Add' }), 'ArrowUp');
    expect(document.activeElement).toBe(screen.getByTestId('r3'));
    pair.close();
  });

  it('ArrowUp on the first row keeps focus there', async () => {
    const pair = await setup('?replicas=1', true);
    const r1 = screen.getByTestId('r1');
    press(screen.getByRole('button', { name: 'Add' }), 'ArrowDown');
    expect(document.activeElement).toBe(r1);
    press(r1, 'ArrowUp');
    expect(document.activeElement).toBe(r1);
    pair.close();
  });
});
