# Contributing

Thanks for your interest in improving LIMBO.

## Getting started
1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install: `pnpm install` (Node 22, pnpm 10)
3. Run an app: `pnpm --filter @limbo/basecamp dev` (http://localhost:5174) or `pnpm --filter @limbo/aftershock dev` (http://localhost:5176)

## Before you open a PR
- `pnpm typecheck` is clean and `pnpm lint` passes (every `*.op.ts` declares its merge and intent, matches `kit/props/intents.json`, and reads no clock or randomness).
- `pnpm test:coverage` passes. It runs the unit, component and property tests and **fails below 100% coverage** of the skeleton and each app's domain modules.
- `pnpm e2e:ci` passes (Playwright: two browser contexts, a real partition, the offline shell, `/judge`).
- A new op declares its merge rule and has a property file; the convergence properties must stay green (`pnpm props`).
- `/.kiro` stays at the repository root and is never gitignored (`pnpm kiro:check`).
- Add or update tests for any behaviour change, and keep commits in the Angular style (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`, `test:`, `ci:`).

## Releases
Releases are cut automatically from commit messages by `.github/workflows/release.yml`, and only after the CI workflow is green on `main`:

| Commit prefix | Bump |
|---|---|
| `fix:`, `perf:` | patch (`0.1.0` to `0.1.1`) |
| `feat:` | minor (`0.1.1` to `0.2.0`) |
| `feat!:` or a `BREAKING CHANGE:` footer | major |
| `docs:`, `chore:`, `test:`, `refactor:`, `style:`, `ci:`, `build:` | no release |

The first release is `v0.1.0`. Docs-only pushes produce no release on purpose.

## Reporting bugs and requesting features
Open an issue using the provided templates. Include repro steps, expected versus actual behaviour, and environment details.
Security issues go through private vulnerability reporting instead (see [SECURITY.md](SECURITY.md)).
