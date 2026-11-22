# Design: bugfix-final-pass

Scope: `apps/aftershock/src/views/SectorGrid.tsx` and its test (D1); `apps/basecamp/src/model.ts` and its test (D2). No change to `skeleton/`, `kit/**`, any op file, any property file, `vitest.config.ts` or `package.json`.

Tests run in the `limbo` project (`*.test.tsx`, jsdom) and the `unit` project (`*.test.ts`).

---

## D1 Label in Name

### Root cause

Two independent causes in `SectorGrid.tsx`:

1. The cell's children are `<span id/>`, `<span glyph aria-hidden/>`, `<span word/>`, `<span total/>` written on separate JSX lines. JSX drops line-break whitespace between elements, so the DOM has no text node between them. The accessible text run is `A1SAFE2`.
2. `aria-label` replaces the content as the cell's name. WCAG 2.5.3 needs the name to contain the visible text. `cellLabel` returns `A2, not reported` for a cell that shows `NO REPORT`, and returns `B1, SAFE, 0 people reported` for a cell whose visible run is `B1SAFE`.

### Fix

- In the cell body, put `{' '}` between the spans (id, glyph, word, total). `.as-cell` is a flex column, so whitespace-only text nodes between its children are not rendered and the layout does not change. The glyph is `aria-hidden`, so the visible text for naming is `A1 SAFE 2`. Do not add CSS.
- `cellLabel`: change `` `${id}, not reported` `` to `` `${id}, no report` ``. The reported branch stays.
- Why the match holds: axe ignores punctuation when it compares, so `A1 SAFE 2` is contained in `A1, SAFE, 2 people reported` and `A2 NO REPORT` in `A2, no report`. A reported cell with no counts shows `B1 SAFE` and is named `B1, SAFE, 0 people reported`.
- Update `SectorGrid.test.tsx` line 42 and R17.3 in `.kiro/specs/aftershock/requirements.md` (line 177) to "no report".

### Tests

New file-local helper in `SectorGrid.test.tsx`:

```ts
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
function visibleText(cell: HTMLElement): string {
  const c = cell.cloneNode(true) as HTMLElement;
  c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return norm(c.textContent ?? '');
}
const nameOf = (cell: HTMLElement) => norm(cell.getAttribute('aria-label')!.replace(/,/g, ''));
```

Failing test (red before the fix): "every cell's visible text is contained in its accessible name". Render `SectorGrid` with a `sectors` map built by hand so all four states occur: one cell each of `safe`, `damaged`, `unsafe`, one reported cell with a count total of 2 and one with no counts, and the rest unreported. For each cell assert `nameOf(cell)` contains `visibleText(cell)`. Assert the four states are present (`data-severity` values `safe`, `damaged`, `unsafe`, `none`), so the loop is not vacuous. It also runs over the 24 seed cells.
Today it fails on every cell: `a1safe2` is not in `a1 safe 2 people reported`, and `a2no report` is not in `a2 not reported`.

Failing test: "spans are separated by whitespace". For `A1`, the text nodes that are direct children of the cell, joined, contain whitespace, and `cell.textContent` without the glyph does not match `/\d[A-Z]/` (id digit followed by a letter) with no space. Red today (no text nodes).

Updated tests: "aria-labels follow R17.3" expects `C3, no report`; the reported labels are unchanged.

Test that shows the look is unchanged: the existing "cells have a 44 px minimum size in CSS" test, plus a new assertion on `app.css` that `.as-cell` declares `display: flex` and `flex-direction: column` (whitespace text nodes are ignored only in a flex container; this guards the premise of the fix).

### Checks that unchanged behaviour holds

- `SectorGrid.test.tsx`, unchanged tests: seed counts (10 words, 14 NO REPORT), B2/E3 DAMAGED, A1 total `2`, the single `tabindex="0"`, arrows, edges, Home/End, Enter/Space, text-input guard, 44 px CSS.
- `survey-scene.test.tsx` and `app.test.tsx` in `apps/aftershock/src`. Grep `e2e/` and `apps/*/src` for `not reported`: the only hits today are `SectorGrid.tsx`, `SectorGrid.test.tsx` and the requirements file, so no e2e assertion changes. Re-grep after the fix and expect zero hits outside the spec's history.
- `pnpm e2e` (aftershock, aftershock-shell, ui-polish-aftershock) for roving focus and the 390 px and 1440 px layout checks.
- Manual: re-run the same axe audit on the live page (both replicas, `/` and `/?replicas=2`) and expect `label-content-name-mismatch` to pass on all 24 cells. axe is not a dependency of this repo, so this step is done by the owner. If it is not run, say so.

---

## D2 One source of truth for edit ops, written-down register invariants

### Root cause

`EDIT_OPS` and `EDIT_KIND` are two literals with the same five names. `lifeKind` consults one and `materialize` indexes the other with `!`. `Record<string, EditKind>` indexing returns `EditKind | undefined` under `noUncheckedIndexedAccess`, and the `!` hides that. Adding a name to one list only compiles and gives `kind: undefined`.

The three register `!` sites (`amount.value!`, `name.value!`, `pos.value!`) are safe because the write list is never empty and `causalLww` of a non-empty list has a winner. A winner exists because a frontier is non-empty when no op covers itself and deps never form a cycle (`ready` in `causal.ts` only applies an op once its deps are applied). The reason is in the head of the author who removed the fallbacks, not in the code.

### Fix

- Keep `EDIT_KIND` as the only literal: `const EDIT_KIND = { ... } as const satisfies Record<string, EditKind>;`. Replace `EDIT_OPS = new Set([...])` with `new Set<string>(Object.keys(EDIT_KIND))`. `EDIT_KIND[o.op]!` stays: `lifeKind` admits only keys of `EDIT_KIND`, and `resurrecting` ops come from the `lifeKind`-classified entries, so the lookup is total by construction. A `!` is kept on purpose: a `?? 'add'` fallback adds a branch that can never be covered (100% branch coverage).
- `Object.keys` excludes inherited names, so `constructor` and `toString` are never edits.
- Export `lifeKind` and `EDIT_KIND` from `model.ts` for the test (an app module, outside the skeleton budget).
- Add one-line comments:
  - line 122: `// amountOf seeds the write list with the first add, and the buffer never applies a dep cycle, so the join has a winner`
  - line 208: `// nameWrites spreads adds (never empty here), so the join always has a winner`
  - line 216: `// keyWrites spreads adds (never empty here), so the join always has a winner`
  Each states: the write list contains the first add, deps cannot form a cycle (causal buffer), so a non-empty `causalLww` has a winner.
- No change to `expense.state.ts` logic. Optionally one comment on `amountOf` that it is non-empty by construction.

### Tests

D2 has no runtime failure today, because the two lists agree. The red step is therefore a mutation, not a failing test:

- New in `model.test.ts`, "every op `lifeKind` treats as an edit has an `EDIT_KIND` entry": take the op names from `ops` in `apps/basecamp/src/ops/registry.gen.ts` plus every name in `EDIT_KIND`; for each name `n`, build `{ op: n }` and when `lifeKind(op) === 'edit'` assert `EDIT_KIND[n]` is defined and one of the five kinds. Also assert `lifeKind` of `item.add` is `create`, `item.restore` is `restore`, `item.delete` is `delete`, and `item.move`, `item.release`, `expense.add` are `undefined`.
- Mutation check (recorded in the task, not committed): with the old two literals, add `'item.move'` to `EDIT_OPS` only and run the test. It fails with the `EDIT_KIND` lookup undefined. After the fix the same edit is impossible, since `EDIT_OPS` has no literal.
- New in `model.test.ts`, "a group holding only an item's add materialises name and position from it": `materialize([add])` where `add` has `name: 'tent'`, `key: 'a0'`; assert `items.i.name === 'tent'`, `items.i.pos === 'a0'`, `values.name` is `[]`. Add the expense twin: a group holding only `expense.add` gives `amountCents` from that add. Both pass today (characterisation tests, they pin the invariant).
- Existing "reports the kind of each resurrecting edit" gets the two missing cases: a resurrecting `item.add` reports `add` and a resurrecting `item.tick` reports `tick`.

### Checks that unchanged behaviour holds

- `model.test.ts`, `actions.test.ts`, `conflicts.test.ts`, `scene.test.ts`, `seed.test.ts` unchanged and green.
- `pnpm props`: the goldens G01 to G21 and every property, no property file edited, same `numRuns`.
- `pnpm test:coverage`: 100% on lines, statements, functions, branches. The derived `EDIT_OPS` and the exports add no uncovered branch.
- `pnpm typecheck`: `EDIT_KIND` with `satisfies` compiles and `EditKind` still covers every value.

---

## Cross-cutting

- `pnpm test:coverage` stays at 100%, and `vitest.config.ts` is not edited.
- `pnpm e2e` is run in full. If it exceeds the session time, report it as not run, never as passed.
- Grep the touched files for `Date.now|new Date|performance.now|Math.random|randomUUID|toLocale`: no hit.
- Skeleton budget is unaffected because `skeleton/` is untouched; confirm with `git`-free means (file list and the measuring command in `evidence/budget-basecamp-baseline.md`).
