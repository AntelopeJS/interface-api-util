# interface-api-util

`@antelopejs/interface-api-util`: request assertions, input validation and the `RateLimit` decorator for handlers written against `@antelopejs/interface-api`. `@antelopejs/api` implements it at run time.

## Layout

- `src/index.ts` holds the assertion and validation helpers and re-exports `src/rate-limit.ts`.
- `src/tests/` holds the mocha suites. `pnpm test` compiles them to `dist/tests` and runs them with `ajs module test .`, which builds a test project from `src/antelope.test.ts`. That project installs `@antelopejs/api` 1.7.4 from npm into `.antelope/cache` and serves on `127.0.0.1:5010`, so the tests need network access and a free port 5010.
- `docs/` and `README.md` are the published documentation. `skills/` ships in the npm package and reaches users through `antelopeJs.skills`; update `skills/api-util-interface/SKILL.md` when the public API changes.

## Versioning

`@antelopejs/interface-api` and `@antelopejs/interface-core` are peer dependencies. The README's compatibility section is checked against `peerDependencies` (`docs-compat`), so change the ranges and the README together.

## Checks outside `pnpm run checks`

CI also runs the documentation check (`AntelopeJS/tooling-configs/actions/docs`) on `README.md` and `docs/` with `docs/tsconfig.json`. It checks local links, the compatibility block, and the TypeScript in doc fences. To run it locally, clone `AntelopeJS/tooling-configs`, run `npm ci --omit=dev` in `actions/docs`, then from this repository run `node <clone>/actions/docs/check.mjs --typescript-project docs/tsconfig.json README.md docs`.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works with the verification skill in [`.agents/skills/verify-interface/SKILL.md`](.agents/skills/verify-interface/SKILL.md) before you call it done.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
