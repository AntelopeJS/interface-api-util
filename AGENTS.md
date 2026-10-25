# interface-api-util

`@antelopejs/interface-api-util`: request assertions, input validation and the `RateLimit` decorator for handlers written against `@antelopejs/interface-api`. `@antelopejs/api` implements it at run time.

## Layout

- `src/index.ts` holds the assertion and validation helpers and re-exports `src/rate-limit.ts`.
- `src/tests/` holds the mocha suites. `pnpm test` compiles them to `dist/tests` and runs them with `ajs module test .`, which builds a test project from `src/antelope.test.ts`. That project installs `@antelopejs/api` 1.3.0 from npm into `.antelope/cache` and serves on `127.0.0.1:5010`, so the tests need network access and a free port 5010.
- `docs/` and `README.md` are the published documentation. `skills/` ships in the npm package and reaches users through `antelopeJs.skills`; update `skills/api-util-interface/SKILL.md` when the public API changes.

## Versioning

`@antelopejs/interface-api` and `@antelopejs/interface-core` are peer dependencies. The README's compatibility section is checked against `peerDependencies` (`docs-compat`), so change the ranges and the README together.

## Checks outside `pnpm run checks`

CI also runs the documentation check (`AntelopeJS/tooling-configs/actions/docs`) on `README.md` and `docs/` with `docs/tsconfig.json`. It checks local links, the compatibility block, and the TypeScript in doc fences. To run it locally, clone `AntelopeJS/tooling-configs`, run `npm ci --omit=dev` in `actions/docs`, then from this repository run `node <clone>/actions/docs/check.mjs --typescript-project docs/tsconfig.json README.md docs`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
