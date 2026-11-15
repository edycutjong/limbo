---
inclusion: fileMatch
fileMatchPattern: ["**/ops/**", "**/*.props.ts", "**/*.props.test.ts", "kit/props/**"]
---
# Testing rules

- Convergence alone is not enough. A toggle converges on the wrong answer. The kit-owned intent properties in `kit/props/intent/` catch that.
- Write any op-specific invariant from the requirement before writing the op.
- Run the fast-tier properties (`pnpm props`) before finishing.
- Never weaken a property, skip it, or lower `numRuns` to make it pass. A property change needs a spec change.
- Vacuity guard: each conflict class must actually occur in the generated runs. A property that never meets its conflict proves nothing.
- Mutation check: every fixture in `kit/props/bad/` must fail at least one property or golden history.
- Describe results as "measured, property-tested". Never "proven" or "guaranteed". Numbers come from `evidence/`.
- Test files: `*.test.ts` run in the `unit` project, `*.props.test.ts` in the `props` project.
