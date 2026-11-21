// ExpenseRow (R7.3 to R7.7, R17.4): label, amount, payer, members with their shares, the `sum-split`
// rule line, an amount field, add and remove member, and the amount value twin. Pure presentation over
// the materialized expense; every control creates one op through `actions`. Money is integer cents.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Twin, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import { displayName, MEMBERS, memberOfReplica } from '../members.ts';
import { formatCents, parseCents } from '../money.ts';
import type { Expense, State } from '../model.ts';
import { TARGET } from './target.ts';

export interface ExpenseRowProps {
  /** Which replica's expense to show. */
  id: Id;
  replica: Replica<State>;
  expense: Expense;
}

const NUM = { fontVariantNumeric: 'tabular-nums' } as const;
const author = (by: string): string => displayName(memberOfReplica(by) ?? by);

export function ExpenseRow(p: ExpenseRowProps): ReactNode {
  const { id, replica, expense: e } = p;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const absent = MEMBERS.filter((m) => !e.members.includes(m));
  const toAdd = absent.includes(pick as (typeof MEMBERS)[number]) ? pick : (absent[0] ?? '');

  const submit = (ev: FormEvent): void => {
    ev.preventDefault();
    const cents = parseCents(text);
    if (cents === null) {
      setError('Enter an amount in dollars, like 26 or 26.50 (at most two decimals).');
      return;
    }
    setError(null);
    act.setAmount(replica, e.id, cents);
    setText('');
  };

  const body = (
    <div className="bc-expense-body">
      <div className="bc-expense-head">
        <span data-label>{e.label}</span> <span data-amount style={NUM}>{formatCents(e.amountCents)}</span>{' '}
        <span data-payer>{`paid by ${displayName(e.payer)}`}</span>
      </div>
      <ul className="bc-shares" aria-label={`Shares for ${e.label}`}>
        {e.members.map((m) => (
          <li key={m} className="bc-share" data-member={m}>
            <span>{displayName(m)}</span>{' '}
            <span data-share style={NUM}>
              {formatCents(e.shares[m] ?? 0)}
            </span>{' '}
            <button type="button" style={TARGET} aria-label={`Remove ${displayName(m)}`} onClick={() => act.removeExpenseMember(replica, e.id, m)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {e.unallocated > 0 && (
        <p data-unallocated style={NUM}>{`${formatCents(e.unallocated)} unallocated: no members`}</p>
      )}
      <p className="bc-rule">Shares: sum-split. Whole cents, split evenly; the first members by id take the extra cents.</p>
      <form className="bc-expense-amount" onSubmit={submit}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Amount for ${e.label}`}
          placeholder="Amount"
          style={TARGET}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
        />
        <button type="submit" style={TARGET}>
          Set amount
        </button>
        {error !== null && <span role="alert" className="bc-error">{error}</span>}
      </form>
      {absent.length > 0 && (
        <div className="bc-expense-add">
          <select aria-label={`Member to add to ${e.label}`} style={TARGET} value={toAdd} onChange={(ev) => setPick(ev.target.value)}>
            {absent.map((m) => (
              <option key={m} value={m}>
                {displayName(m)}
              </option>
            ))}
          </select>
          <button type="button" style={TARGET} onClick={() => toAdd !== '' && act.addExpenseMember(replica, e.id, toAdd)}>
            Add member
          </button>
        </div>
      )}
    </div>
  );

  const [v1, v2] = e.values;
  if (v1 !== undefined && v2 !== undefined) {
    return (
      <li className="bc-expense bc-twin-row" data-expense={e.id}>
        <Twin
          replica={id}
          id={`${e.id}:amount`}
          atRest={body}
          ghost={e.values.filter((v) => v.value !== e.amountCents).map((v) => formatCents(v.value)).join(' / ')}
          caption={`TWIN · ${author(v1.by)} set this to ${formatCents(v1.value)} while ${author(v2.by)} set it to ${formatCents(v2.value)}`}
          rule="causal-lww"
          actions={e.values.map((v) => (
            <button key={v.value} type="button" style={TARGET} onClick={() => act.setAmount(replica, e.id, v.value)}>
              {formatCents(v.value)}
            </button>
          ))}
        />
      </li>
    );
  }
  return (
    <li className="bc-expense" data-expense={e.id}>
      {body}
    </li>
  );
}
