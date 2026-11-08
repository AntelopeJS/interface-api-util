# Feature map

One file per feature. `covers:` lists the source globs it owns, `docs:` the pages a verdict judges, and `journeys:` the journeys it runs. `pnpm exec antelopejs-verify map` checks that every user-facing file is covered.

| Feature | What the user does | Journeys |
|---|---|---|
| [assertions](assertions.md) | A handler rejects a request with `assert` or validates a body with `assertValidation`, and the client gets the status and body it chose. | assertions-served, validation-edges, assertion-types |
| [rate-limit](rate-limit.md) | A handler is decorated with `@RateLimit`, and clients past the limit get 429 with `Retry-After` while the others get the `X-RateLimit` headers. | rate-limit-served, rate-limit-ordering, rate-limit-types |
| [smoke](smoke.md) | The fixed journeys every verdict runs: load the packed package with a stub provider and call every function. | every-function, minor-bump |
