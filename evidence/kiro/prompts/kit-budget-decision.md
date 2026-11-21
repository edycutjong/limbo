Owner decision on the skeleton line budget (answering your question in the limbo-layer task 15 session).

The provisional budget in `.kiro/steering/tech.md` ("At most 30 files, 1,800 TS/TSX lines") was set before the sync layer, the
Limbo visual layer and the dev-only relay link existed. Measured now: 21 files, 2,137 non-blank, non-comment TS/TSX lines
(command in `evidence/budget-basecamp-baseline.md`). Decision: do not trim working code for this; restate the budget honestly.

1. In `.kiro/steering/tech.md`, replace the budget line with: at most 30 files and 2,400 TS/TSX lines (non-blank, non-comment,
   tests and `limbo/test/` excluded, measured with the command in `evidence/budget-basecamp-baseline.md`), and one sentence of
   history: the provisional 1,800 was exceeded at 2,020 (before the basecamp spec) and 2,137 (after it), and was raised by the owner
   on 2026-11-21 rather than trimming working code. Keep everything else in the file unchanged.
2. Append a short "Owner decision 2026-11-21" section to `evidence/budget-basecamp-baseline.md` with the same numbers.
3. Mark task 15 of `.kiro/specs/limbo-layer/tasks.md` complete, with the overage recorded in the task result.
Do not change any code. Do not run git.
