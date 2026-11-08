---
covers:
  - src/rate-limit.ts
docs:
  - docs/1.introduction.md
  - README.md
journeys:
  - rate-limit-served
  - rate-limit-ordering
  - rate-limit-types
---

# Rate limit

A handler decorated with `@RateLimit(limit, windowMs, options?)` below its route decorator counts requests per key in a fixed window. An allowed request carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`; a request past the limit gets 429, the `message` body and `Retry-After`, and the handler does not run.

## Sub-features

- `rate-limit-served`: the controller served by `ajs project dev` with the repository's `@antelopejs/api`, as in `assertions-served`. Over HTTP: the count and the headers on allowed requests, a handler that returns `context.response` and one that returns a plain value; 429 with `Too many requests`, `Retry-After` and the headers past the limit; a separate count on another handler; a custom `key` from a route parameter with a custom `message`; a falsy custom key falling back to the client address. `X-RateLimit-Reset` and `Retry-After` are wall-clock values, so the journey checks that they lie within the window, in seconds.
- `rate-limit-ordering`: in a Node process, `@RateLimit` applied before the route decorator registers, and applied after it throws the ordering error.
- `rate-limit-types`: a probe pins the parameters of `RateLimit`, its `MethodDecorator` result from `@antelopejs/interface-core/decorators`, and the exact shape of `RateLimitOptions`.

## How to get to it (user POV)

- `@Get("users") @RateLimit(100, 60_000) list() { ... }` in a controller of a module served by `@antelopejs/api`, then more than 100 requests from one client within a minute.

## Driving it with antelopejs-verify

```bash
pnpm exec antelopejs-verify journey "$RUN" rate-limit
```

## Gotchas

- Every request of `rate-limit-served` comes from `127.0.0.1`, so the default key is the same for all of them; the fallback check relies on that.
- The windows are 10 minutes long so that no window resets during the journey.
