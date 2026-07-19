---
name: api-util-interface
description: Provides handler-side utilities for AntelopeJS APIs built on @antelopejs/interface-api - assert and assertValidation turn failed checks into HTTPResult error responses, and the @RateLimit method decorator adds fixed-window throttling with 429/Retry-After and X-RateLimit headers. Use when code imports from "@antelopejs/interface-api-util", when validating request bodies (e.g. with a Zod schema) inside @Get/@Post handlers, when returning 400/404/403-style errors from API controllers, or when asked to rate limit a route.
category: antelopejs-interface
tags: [antelopejs, api, validation, rate-limit, http]
---

# API Util Interface

Consumer-side helper library for AntelopeJS API modules. It is NOT an interface proxy itself:
nothing here crosses an interface boundary, so there is no `ImplementInterface` side. Everything
builds on its peer dependencies `@antelopejs/interface-api` (for `HTTPResult`, `RequestContext`,
controller metadata) and `@antelopejs/interface-core` (decorator machinery). All failures surface
as thrown `HTTPResult` values, which the API interface converts into HTTP responses.

## Imports

The package has a single export subpath (root only):

```ts
import { assert, assertValidation, RateLimit, type RateLimitOptions } from "@antelopejs/interface-api-util";
```

`hitWindow`, `pruneExpired`, and `resolveKey` are also exported but marked `@internal` (rate-limit
plumbing, exposed for tests) — do not reach for them in application code.

## Usage

```ts
import { Controller, Get, Post, HTTPResult, Parameter, RawBody } from "@antelopejs/interface-api";
import { assert, assertValidation, RateLimit } from "@antelopejs/interface-api-util";
import * as z from "zod";

const createUserSchema = z.object({ name: z.string().min(1), email: z.string().email() });

class UsersController extends Controller("users") {
  @Get(":id")
  @RateLimit(100, 60_000)
  async get(@Parameter("id") id: string) {
    const user = await findUser(id);
    assert(user, 404, "User not found"); // narrows `user` to non-falsy below
    return new HTTPResult(200, user);
  }

  @Post()
  async create(@RawBody() body: Buffer) {
    const { name, email } = assertValidation(body, (b) => createUserSchema.parse(JSON.parse((b as Buffer).toString())));
    return new HTTPResult(201, await saveUser({ name, email }));
  }
}
```

- `assert(condition, code, message)` — throws `new HTTPResult(code, message)` when falsy; uses
  TypeScript `asserts condition`, so the compiler narrows after the call.
- `assertValidation(body, validator, errorFunc?, code = 400)` — returns the validator's result;
  if the validator throws, rethrows an `HTTPResult` whose body is `errorFunc(err)` if provided,
  otherwise `String(err)`.
- `RateLimit(limit, windowMs, options?)` — fixed-window counter per key; over-limit requests throw
  a 429 `HTTPResult` (with `Retry-After`) before the handler runs. Successful responses get
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (epoch seconds) headers.

## Gotchas

- Decorator ordering: `@RateLimit` must sit directly BENEATH the route decorator
  (`@Get`, `@Post`, ...). Placed above it, the guard would be ignored — this is detected at
  decoration time and throws an `Error` at startup instead of silently unprotecting the route.
- Rate-limit keys default to the client IP (`context.rawRequest.socket.remoteAddress`). Behind a
  proxy that is the proxy's address — supply `options.key` reading a trusted forwarded header. If
  the custom `key` function returns a falsy value, the limiter falls back to the client IP rather
  than merging those requests into one shared bucket.
- Counts live in process memory: not shared across instances, reset on restart, pruned once the
  window elapses. For distributed limits, enforce them in a shared store at the edge.
- `options.message` customizes only the 429 body; the status code is fixed at 429.
- These helpers only throw `HTTPResult`; they do not send responses themselves — they rely on the
  API interface's handling of thrown `HTTPResult` values.

## Deeper reference

See this package's `docs/1.introduction.md` (Interface API Util Documentation: `assert`,
`assertValidation`, `RateLimit` sections) and the shipped `dist/*.d.ts` typings. Do not duplicate
them here.
