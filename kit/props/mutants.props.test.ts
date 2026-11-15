// Mutation check (R15): every fixture in `kit/props/bad/` must fail at least one property or
// golden history, and the test names which. A fixture that passes everything fails this test.
// Convergence is measured, property-tested.
import { describe, expect, it } from 'vitest';
import { fixtures } from './bad/index.ts';
import { asDef, type Fixture } from './bad/types.ts';
import { setIntent } from './intent/index.ts';
import { enumerateOrders, loadGoldens, partialMatch } from './golden.ts';
import { failingProperties } from './run.ts';

/** Names of everything the fixture fails: properties, plus `golden:<Gnn>` for a failed history. */
export function killedBy(fx: Fixture): string[] {
  const out: string[] = [];
  if (fx.def) out.push(...failingProperties(fx.def, fx.opts ?? {}));
  if (fx.golden) {
    const g = loadGoldens().find((x) => x.file.startsWith(fx.golden!.file));
    if (g === undefined) throw new Error(`fixture ${fx.name}: golden history ${fx.golden.file} not found`);
    for (const order of enumerateOrders(g.ops)) {
      if (partialMatch(fx.golden.run(order), g.expect) !== true) {
        out.push(`golden:${fx.golden.file}`);
        break;
      }
    }
  }
  return out;
}

describe('mutation fixtures', () => {
  it('has the 12 fixtures of R15.1', () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual(
      [
        'arrival-order', 'claim-both', 'claim-max-stamp', 'delete-wins', 'lww-wallclock', 'move-reinsert',
        'qty-read-modify-write', 'resolve-noop', 'severity-lww', 'split-first-member', 'split-float', 'tick-toggle',
      ].sort(),
    );
  });

  for (const fx of fixtures) {
    it(`${fx.name} fails at least one property or golden history`, () => {
      const killed = killedBy(fx);
      expect(killed, `fixture "${fx.name}" survived every property and golden history`).not.toEqual([]);
      // Name the killer; the declared expectation must be among them.
      console.log(`mutant ${fx.name}: killed by ${killed.join(', ')}`);
      expect(killed.some((k) => fx.expectFails.includes(k)), `${fx.name} expected ${fx.expectFails.join(' or ')}, failed ${killed.join(', ')}`).toBe(true);
    });
  }

  it('arrival-order fails convergence (R15.4)', () => {
    const fx = fixtures.find((f) => f.name === 'arrival-order')!;
    expect(killedBy(fx)).toContain('convergence');
  });

  it('self-check: a correct copy of a fixture is reported as survived', () => {
    type S = { ticked?: boolean };
    const correct: Fixture = {
      name: 'tick-correct',
      expectFails: ['intent:set'],
      def: asDef({
        name: 'f.tickok',
        merge: 'causal-lww',
        intent: { kind: 'set', field: 'ticked' },
        // Explicit set, last by causal order; commutes is not claimed.
        apply: (s: S, op: { payload: { ticked: boolean } }): S => ({ ...s, ticked: op.payload.ticked }),
      }),
      opts: {
        gen: (_d, r) => ({ target: 't', payload: { ticked: r.chance(0.7) } }),
        checks: [setIntent({ write: (o) => (o.op === 'f.tickok' ? (o.payload as { ticked: boolean }).ticked : undefined), read: (s: S) => s.ticked })],
      },
    };
    // A correct reducer needs a deterministic tie-break: here apply is order dependent, so it may fail
    // convergence. Use only the intent property to show the check can report survival.
    const killed = killedBy(correct).filter((k) => k === 'intent:set');
    expect(killed).toEqual([]);
  });
});
