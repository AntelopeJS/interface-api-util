# @antelopejs/interface-api-util

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-api-util"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-api-util?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-api-util?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://interfaces.antelopejs.com/docs/api-util"><img alt="Docs" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>
</div>

Request validation and rate limiting helpers for handlers written against [`@antelopejs/interface-api`](https://github.com/AntelopeJS/interface-api). Every failure becomes an `HTTPResult` error response.

## What it offers

- `assert(condition, code, message)` throws an `HTTPResult` when the condition is falsy and narrows its type when it holds.
- `assertValidation(body, validator)` runs a synchronous validator, such as a Zod `parse`, and turns a thrown error into a `400` response.
- `@RateLimit(limit, windowMs)` caps calls to a handler per client in a fixed window and answers `429` beyond it.

## Implementations

The helpers run in your module. They need the API interface served by a module:

| Module                                                 | Notes                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`@antelopejs/api`](https://github.com/AntelopeJS/api) | Implements `@antelopejs/interface-api` and `@antelopejs/interface-api-util` |

## Install

Add the package to the module that declares routes:

```bash
pnpm add @antelopejs/interface-api-util
```

Then add an implementation of the API interface to the project:

```bash
ajs project modules add @antelopejs/api
```

## Quick start

```ts
import {
  Controller,
  Get,
  HTTPResult,
  Parameter,
} from "@antelopejs/interface-api";
import { RateLimit, assert } from "@antelopejs/interface-api-util";

const BOOKS = new Map([["1", { title: "The Glass Meridian" }]]);

export class BookController extends Controller("/books") {
  @Get(":id")
  @RateLimit(100, 60_000)
  async getBook(@Parameter("id") id: string) {
    const book = BOOKS.get(id);
    assert(book, 404, "Book not found");
    return new HTTPResult(200, book);
  }
}
```

Place `@RateLimit` directly below the route decorator. Placed above it, `@RateLimit` throws when the class is defined.

## Documentation

- [Assertions, validation and rate limiting](./docs/1.introduction.md)

## Compatibility

The module declares these peer dependencies:

<!-- antelopejs-docs-compat:start -->

| Package                      | Supported         | Tested with |
| ---------------------------- | ----------------- | ----------- |
| `@antelopejs/interface-api`  | `>=0.0.15 <1.0.0` | `0.0.15`    |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0`  | `0.2.4`     |

<!-- antelopejs-docs-compat:end -->

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## License

[Apache-2.0](./LICENSE)
