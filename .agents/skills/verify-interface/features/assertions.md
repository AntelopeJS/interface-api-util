---
covers:
  - src/index.ts
docs:
  - docs/1.introduction.md
  - README.md
journeys:
  - assertions-served
  - validation-edges
  - assertion-types
---

# Assertions

A handler calls `assert(condition, code, message)` to reject a request, or `assertValidation(body, validator, errorFunc?, code?)` to run a synchronous validator on its input. A failed check throws an `HTTPResult`, which the API module sends as the response.

## Sub-features

- `assertions-served`: a module author's controller, compiled with the repository's TypeScript and served by `ajs project dev` with the repository's `@antelopejs/api`, whose copy of this package is linked to HEAD. Over HTTP: a passing `assert` lets the handler answer; a failing one answers its status and message as `text/plain`. `assertValidation` returns the validated value; without `errorFunc` it answers 400 with `String(err)`; a string from `errorFunc` is sent as `text/plain`, an object as JSON with the chosen status, and `undefined` as an empty `text/plain` body.
- `validation-edges`: in a Node process, `assert` returns on a truthy value; `assertValidation` returns a validator's promise unchanged and leaves its rejection unconverted.
- `assertion-types`: a probe compiled in strict mode against the built declarations pins both signatures, the `asserts condition` narrowing, and the inference of `Input` from the body.

## How to get to it (user POV)

- `assert(user, 404, "User not found")` or `assertValidation(body, schema.parse)` inside an `@Get` or `@Post` handler of a module served by `@antelopejs/api`.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" assertions
```

## Gotchas

- Core binds `@antelopejs/interface-api-util` to the copy the API module brings, so the served journeys use `node_modules/@antelopejs/api` as a local source, and the `pnpm-workspace.yaml` override links its copy to this repository. An `@antelopejs/api` installed from npm would serve the published release, and the journeys would pass whatever HEAD does.
