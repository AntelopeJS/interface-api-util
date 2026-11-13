<a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration src="./.github/readme/strip.svg" width="100%" alt="INTERFACE · API UTIL: part of AntelopeJS, hexagonal architecture beyond your own code. A glowing button reads Star AntelopeJS."></a>

<div align="center">

# `@antelopejs/interface-api-util`

<a href="https://www.npmjs.com/package/@antelopejs/interface-api-util"><img data-illustration alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-api-util?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="./LICENSE"><img data-illustration alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-api-util?style=for-the-badge&labelColor=000000&color=000000"></a> <a href="https://discord.gg/g4pFt6eXqu"><img data-illustration alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a> <a href="https://interfaces.antelopejs.com/docs/api-util"><img data-illustration alt="Docs" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a> <a href="https://github.com/AntelopeJS/antelopejs"><img data-illustration alt="Star AntelopeJS" src="https://img.shields.io/github/stars/AntelopeJS/antelopejs?label=Star%20AntelopeJS&style=for-the-badge&labelColor=000000&color=000000&logo=github"></a>

**Request validation, rate limiting and HTTP errors for AntelopeJS API handlers.**

[Documentation](https://interfaces.antelopejs.com/docs/api-util) · [Implementations](#implementations) · [All interfaces and providers](https://github.com/AntelopeJS/antelopejs#ecosystem)

</div>

Request validation and rate limiting helpers for handlers written against [`@antelopejs/interface-api`](https://github.com/AntelopeJS/interface-api). Every failure becomes an `HTTPResult` error response.

## What it offers

- `assert(condition, code, message)` throws an `HTTPResult` when the condition is falsy and narrows its type when it holds.
- `assertValidation(body, validator)` runs a synchronous validator, such as a Zod `parse`, and turns a thrown error into an error response, `400` by default.
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

| Package                      | Supported        | Tested with |
| ---------------------------- | ---------------- | ----------- |
| `@antelopejs/interface-api`  | `>=0.3.0 <1.0.0` | `0.2.0`     |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` | `0.4.0`     |

<!-- antelopejs-docs-compat:end -->

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you open a pull request. The local checks are:

```bash
pnpm install
pnpm lint
pnpm test
```

## Part of AntelopeJS

[AntelopeJS](https://github.com/AntelopeJS/antelopejs) is the framework: modules depend on contracts, the application chooses the provider, and [AntelopeJS DMS](https://github.com/AntelopeJS/dms) is built on it.

<!-- antelopejs-framework-modules:start -->

| Area         | Contracts                                                                                                                                                                                                                                                                                                                                                                                                                  | Providers                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API          | [`interface-api`](https://github.com/AntelopeJS/interface-api) · **`interface-api-util`** · [`interface-data-api`](https://github.com/AntelopeJS/interface-data-api)                                                                                                                                                                                                                                                       | [`api`](https://github.com/AntelopeJS/api)                                                                                                                                                                                                          |
| Auth         | [`interface-auth`](https://github.com/AntelopeJS/interface-auth)                                                                                                                                                                                                                                                                                                                                                           | [`auth-jwt`](https://github.com/AntelopeJS/auth-jwt)                                                                                                                                                                                                |
| Database     | [`interface-database`](https://github.com/AntelopeJS/interface-database) · [`interface-database-decorators`](https://github.com/AntelopeJS/interface-database-decorators) · [`interface-database-catalog`](https://github.com/AntelopeJS/interface-database-catalog) · [`interface-mongodb`](https://github.com/AntelopeJS/interface-mongodb) · [`interface-rethinkdb`](https://github.com/AntelopeJS/interface-rethinkdb) | [`postgres`](https://github.com/AntelopeJS/postgres) · [`mysql`](https://github.com/AntelopeJS/mysql) · [`mongodb`](https://github.com/AntelopeJS/mongodb) · [`rethinkdb`](https://github.com/AntelopeJS/rethinkdb)                                 |
| Redis        | [`interface-redis`](https://github.com/AntelopeJS/interface-redis) · [`interface-redis-scheduler`](https://github.com/AntelopeJS/interface-redis-scheduler)                                                                                                                                                                                                                                                                | [`redis`](https://github.com/AntelopeJS/redis)                                                                                                                                                                                                      |
| Email        | [`interface-email`](https://github.com/AntelopeJS/interface-email)                                                                                                                                                                                                                                                                                                                                                         | [`nodemailer`](https://github.com/AntelopeJS/nodemailer) · [`brevo`](https://github.com/AntelopeJS/brevo)                                                                                                                                           |
| File storage | [`interface-file-storage`](https://github.com/AntelopeJS/interface-file-storage)                                                                                                                                                                                                                                                                                                                                           | [`file-storage-local`](https://github.com/AntelopeJS/file-storage-local) · [`file-storage-s3`](https://github.com/AntelopeJS/file-storage-s3)                                                                                                       |
| Payments     | [`interface-payment`](https://github.com/AntelopeJS/interface-payment) · [`interface-subscriptions`](https://github.com/AntelopeJS/interface-subscriptions) · [`interface-stripe`](https://github.com/AntelopeJS/interface-stripe)                                                                                                                                                                                         | [`stripe`](https://github.com/AntelopeJS/stripe) · [`mollie`](https://github.com/AntelopeJS/mollie) · [`checkout-com`](https://github.com/AntelopeJS/checkout-com) · [`payment-subscriptions`](https://github.com/AntelopeJS/payment-subscriptions) |

<!-- antelopejs-framework-modules:end -->

## License

[Apache-2.0](./LICENSE)
