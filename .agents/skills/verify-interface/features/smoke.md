---
covers:
docs:
  - docs/1.introduction.md
journeys:
  - every-function
  - minor-bump
---

# Smoke

The fixed journeys every verdict runs, whatever the diff touches: pack the package, load it in `ajs project dev` with a stub provider and a consumer, call every declared function through core, and compare the declared functions with the published version.

## Sub-features

- `every-function`: the package declares no interface proxy, so every function is a plain call from `verify.config.ts`: `assert`, `assertValidation`, `RateLimit` and the `@internal` helpers `hitWindow`, `pruneExpired` and `resolveKey` each answer through core with the value the config expects.
- `minor-bump`: an added, changed or removed function releases as at least a new minor.

## How to get to it (user POV)

- A project with `@antelopejs/api` and a module that imports `@antelopejs/interface-api-util`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" smoke
```

## Gotchas

- The smoke feature covers no glob, so it never marks a file as mapped.
- `minor-bump` needs the npm registry; without it the journey is not verified.
