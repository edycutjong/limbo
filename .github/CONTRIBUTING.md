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

Versions are cut by `.github/workflows/release.yml`, only after `CI` is green on `main`, and always on the commit that CI run
judged. The bump comes from the commit subjects since the last tag, in the Angular convention (the rules live in
`.github/scripts/next-version.sh`, which also runs locally as a dry run: `bash .github/scripts/next-version.sh`):

| Commit subject | Bump |
|---|---|
| `fix: ...`, `perf: ...` | patch (`0.1.0` to `0.1.1`) |
| `feat: ...` | minor (`0.1.1` to `0.2.0`) |
| any type with `!` (`feat!: ...`), or a `BREAKING CHANGE:` footer | major; while the version is `0.x`, minor |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `build:`, `revert:`, or no type at all | no release |

Authorship prefixes are allowed in front of the type and are ignored when the bump is computed: `[kiro] `,
`[claude-direct] `, `kiro: ` and `claude-direct: ` (`[kiro] feat(shelf): ...` is a minor bump, `[claude-direct] docs: ...` is none). A prefix with no type after it cuts nothing.

Automatic cuts happen only while the repository variable `AUTO_RELEASE` is `true`; otherwise the run reports what it would
cut, and the owner can cut by hand (Actions > Release > Run workflow, with an optional dry run). After every run the workflow
keeps the README's release badge (`docs/badges/release.svg`) on the latest release, committing it as
`chore(release): badge vX.Y.Z`.

## Reporting bugs and requesting features
Open an issue using the provided templates. Include repro steps, expected versus actual behaviour, and environment details.
Security issues go through private vulnerability reporting instead (see [SECURITY.md](SECURITY.md)).
