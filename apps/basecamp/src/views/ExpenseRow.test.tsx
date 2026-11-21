import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
import * as actions from '../actions.ts';
import { boot } from '../main.tsx';
import type { State } from '../model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;

async function mount(): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  await act(async () => {
    pair = await boot(el!, { reload: () => undefined }).ready;
  });
  return pair!;
}
type Side = 'a' | 'b';
const card = (id: Side): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
const exp = (id: Side, e: string): HTMLElement => card(id).querySelector(`[data-expense="${e}"]`) as HTMLElement;
const shares = (id: Side, e: string): string[] =>
  Array.from(exp(id, e).querySelectorAll('[data-share]')).map((s) => s.textContent ?? '');
const members = (id: Side, e: string): string[] =>
  Array.from(exp(id, e).querySelectorAll('[data-member]')).map((s) => s.getAttribute('data-member') ?? '');
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const settle = (): Promise<void> => act(async () => pair!.settle());
const noTwin = (id: Side): void => expect(card(id).querySelector('.limbo-twin')).toBeNull();

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  await Promise.all(
    ['a', 'b'].map(
      (id) =>
        new Promise<void>((res) => {
          const r = indexedDB.deleteDatabase(`limbo:basecamp:${id}`);
          r.onsuccess = r.onerror = r.onblocked = () => res();
        }),
    ),
  );
});

describe('ExpenseRow', () => {
  it('seed shows $12.00 x4 and $8.34 / $8.33 / $8.33 with the sum-split rule line', async () => {
    await mount();
    expect(shares('a', 'campsite')).toEqual(['$12.00', '$12.00', '$12.00', '$12.00']);
    expect(shares('a', 'gas-snacks')).toEqual(['$8.34', '$8.33', '$8.33']);
    expect(exp('a', 'gas-snacks').textContent).toContain('sum-split');
    expect(exp('a', 'gas-snacks').textContent).toContain('$25.00');
    expect(exp('a', 'gas-snacks').textContent).toContain('paid by Budi');
  });

  it('offline A adds Dewi while B sets $26.00: both show four members, $6.50 each, sum $26.00', async () => {
    const p = await mount();
    p.cut();
    await act(async () => void actions.addExpenseMember(p.a, 'gas-snacks', 'dewi'));
    const input = within(exp('b', 'gas-snacks')).getByLabelText('Amount for Gas + snacks');
    await act(async () => void fireEvent.change(input, { target: { value: '26.00' } }));
    await click(within(exp('b', 'gas-snacks')).getByRole('button', { name: 'Set amount' }));
    p.restore();
    await settle();
    for (const side of ['a', 'b'] as const) {
      expect(members(side, 'gas-snacks')).toHaveLength(4);
      expect(shares(side, 'gas-snacks')).toEqual(['$6.50', '$6.50', '$6.50', '$6.50']);
    }
    expect(p.a.state().expenses['gas-snacks']!.amountCents).toBe(2600);
    expect(Object.values(p.a.state().expenses['gas-snacks']!.shares).reduce((x, y) => x + y, 0)).toBe(2600);
  });

  it('Remove drops a member and the shares re-split', async () => {
    const p = await mount();
    await click(within(exp('a', 'campsite')).getByRole('button', { name: 'Remove Dewi' }));
    await settle();
    expect(shares('b', 'campsite')).toEqual(['$16.00', '$16.00', '$16.00']);
    expect(p.b.state().expenses.campsite!.members).not.toContain('dewi');
  });

  it('concurrent amounts show a twin with two buttons and the pick resolves it', async () => {
    const p = await mount();
    p.cut();
    await act(async () => {
      actions.setAmount(p.a, 'gas-snacks', 3000);
      actions.setAmount(p.b, 'gas-snacks', 2600);
    });
    p.restore();
    await settle();
    const buttons = Array.from(card('a').querySelectorAll('.limbo-twin-actions button')).map((b) => b.textContent);
    expect(buttons).toEqual(['$30.00', '$26.00']);
    expect(card('a').querySelector('.limbo-twin-caption')?.textContent).toBe('TWIN · Sari set this to $30.00 while Budi set it to $26.00');
    await click(within(card('a')).getByRole('button', { name: '$26.00' }));
    await settle();
    noTwin('a');
    noTwin('b');
    expect(p.b.state().expenses['gas-snacks']!.amountCents).toBe(2600);
  });

  it('invalid input shows an inline message and creates no op', async () => {
    const p = await mount();
    const before = p.a.log().length;
    const input = within(exp('a', 'campsite')).getByLabelText('Amount for Campsite fee');
    for (const bad of ['26.555', '-1', 'abc', '']) {
      await act(async () => void fireEvent.change(input, { target: { value: bad } }));
      await click(within(exp('a', 'campsite')).getByRole('button', { name: 'Set amount' }));
      expect(within(exp('a', 'campsite')).getByRole('alert').textContent).toMatch(/two decimals/);
    }
    expect(p.a.log().length).toBe(before);
  });

  it('shares and amounts use tabular numerals', async () => {
    await mount();
    const cells = Array.from(exp('a', 'gas-snacks').querySelectorAll<HTMLElement>('[data-share], [data-amount]'));
    expect(cells).toHaveLength(4);
    for (const s of cells) expect(s.style.fontVariantNumeric).toBe('tabular-nums');
  });
});
