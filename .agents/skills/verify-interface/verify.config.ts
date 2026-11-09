import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { HTTPResult } from "@antelopejs/interface-api";
import type { RequestContext } from "@antelopejs/interface-api";
import type { InterfaceHooks, VerifyConfig } from "@antelopejs/tooling-configs/verify";

import type * as ApiUtil from "../../../src/index.ts";
import { declared, scenario } from "./probes.ts";
import { served } from "./served.ts";

/** A request context whose socket has `address` as its remote address and whose route has a `tenant` parameter. */
function requestFrom(address: string | undefined): RequestContext {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: address });
  const rawRequest = new IncomingMessage(socket);
  return { rawRequest, rawResponse: new ServerResponse(rawRequest), url: new URL("http://127.0.0.1/"), routeParameters: { tenant: "acme" }, response: new HTTPResult() };
}

function outcome(action: () => void): string {
  try {
    action();
    return "returned";
  } catch {
    return "threw";
  }
}

/** The plain functions the consumer calls through core, each with the value it must resolve to. */
const CALLS: NonNullable<InterfaceHooks<typeof ApiUtil>["calls"]> = {
  ".:assert": {
    call: async (api) => ({ truthy: outcome(() => api.assert("value", 500, "unused")), falsy: outcome(() => api.assert(0, 418, "teapot")) }),
    expect: { truthy: "returned", falsy: "threw" },
  },
  ".:assertValidation": {
    call: async (api) => ({
      validated: api.assertValidation({ name: "Ada" }, (body) => ({ ...body, checked: true })),
      rejected: outcome(() =>
        api.assertValidation({}, () => {
          throw new Error("invalid");
        }),
      ),
    }),
    expect: { validated: { name: "Ada", checked: true }, rejected: "threw" },
  },
  ".:RateLimit": { call: async (api) => api.RateLimit(1, 1000).length, expect: 3 },
  ".:hitWindow": {
    call: async (api) => {
      const store: Parameters<typeof api.hitWindow>[0] = new Map();
      return { first: api.hitWindow(store, "k", 1, 1000, 0), second: api.hitWindow(store, "k", 1, 1000, 10), later: api.hitWindow(store, "k", 1, 1000, 1000) };
    },
    expect: {
      first: { allowed: true, remaining: 0, resetMs: 1000 },
      second: { allowed: false, remaining: 0, resetMs: 990 },
      later: { allowed: true, remaining: 0, resetMs: 1000 },
    },
  },
  ".:pruneExpired": {
    call: async (api) => {
      const store: Parameters<typeof api.pruneExpired>[0] = new Map([
        ["ended", { count: 3, windowStart: 0 }],
        ["open", { count: 1, windowStart: 900 }],
      ]);
      api.pruneExpired(store, 1000, 1000);
      return [...store.keys()];
    },
    expect: ["open"],
  },
  ".:resolveKey": {
    call: async (api) => ({
      address: api.resolveKey(requestFrom("10.0.0.7"), {}),
      none: api.resolveKey(requestFrom(undefined), {}),
      custom: api.resolveKey(requestFrom("10.0.0.7"), { key: (context) => context.routeParameters.tenant }),
      falsy: api.resolveKey(requestFrom("10.0.0.7"), { key: () => null }),
    }),
    expect: { address: "10.0.0.7", none: "unknown", custom: "acme", falsy: "10.0.0.7" },
  },
};

const VALIDATION_BODY = `
  const passed = thrown(() => util.assert(1, 500, "unused")) === null;
  const failed = result(thrown(() => util.assert(0, 403, "Forbidden")));
  const plain = result(thrown(() => util.assertValidation({}, () => { throw new Error("boom"); })));
  const mapped = result(thrown(() => util.assertValidation({}, () => { throw "nope"; }, (error) => ({ reason: error }), 409)));
  const empty = result(thrown(() => util.assertValidation({}, () => { throw 1; }, () => undefined)));
  const pending = Promise.reject(new Error("later"));
  pending.catch(() => undefined);
  const same = util.assertValidation({}, () => pending) === pending;
  const rejection = await pending.then(() => null, (error) => (error instanceof api.HTTPResult ? "HTTPResult" : error.message));
  return { passed, failed, plain, mapped, empty, same, rejection };
`;

const ORDERING_BODY = `
  const handler = (name) => { const cls = class extends api.Controller("/" + name) { handler() { return name; } }; return [cls.prototype, Object.getOwnPropertyDescriptor(cls.prototype, "handler")]; };
  const [below, belowDescriptor] = handler("below");
  util.RateLimit(1, 1000)(below, "handler", belowDescriptor);
  api.Get("x")(below, "handler", belowDescriptor);
  const [above, aboveDescriptor] = handler("above");
  api.Get("x")(above, "handler", aboveDescriptor);
  const error = thrown(() => util.RateLimit(1, 1000)(above, "handler", aboveDescriptor));
  return { below: "registered", above: error instanceof Error ? error.message : String(error) };
`;

const ASSERTION_TYPES = `
type _Assert = Assert<Identical<typeof Util.assert, (condition: unknown, code: number, message: string) => asserts condition>>;
type _Validation = Assert<Identical<typeof Util.assertValidation, <T, Input = unknown>(body: Input, validator: (body: Input) => T, errorFunc?: (err: unknown) => HTTPBody | undefined, code?: number) => T>>;
declare const maybe: string | undefined;
Util.assert(maybe, 404, "missing");
const narrowed: string = maybe;
declare const buffer: Buffer;
const length: number = Util.assertValidation(buffer, (body: Buffer) => body.length);
declare const unknownBody: unknown;
const parsed: { name: string } = Util.assertValidation<{ name: string }>(unknownBody, (body: unknown) => ({ name: String(body) }));
export { narrowed, length, parsed };
`;

const RATE_LIMIT_TYPES = `
type _RateLimit = Assert<Identical<Parameters<typeof Util.RateLimit>, [limit: number, windowMs: number, options?: Util.RateLimitOptions | undefined]>>;
type _Decorator = Assert<Identical<ReturnType<typeof Util.RateLimit>, MethodDecorator>>;
type _Options = Assert<Identical<Util.RateLimitOptions, { key?: (context: RequestContext) => string | null | undefined; message?: string }>>;
`;

const ASSERTED = { limit: null, remaining: null, resetWithinWindow: null, retryAfterWithinWindow: null };
const json = (request: string, status: number, body: string) => ({ request, status, type: "application/json", body, ...ASSERTED });
const text = (request: string, status: number, body: string) => ({ request, status, type: "text/plain", body, ...ASSERTED });

const allowed = (request: string, body: string, type: string, limit: string, remaining: string) => ({ request, status: 200, type, body, limit, remaining, resetWithinWindow: true, retryAfterWithinWindow: null });
const limited = (request: string, body: string, limit: string) => ({ request, status: 429, type: "text/plain", body, limit, remaining: "0", resetWithinWindow: true, retryAfterWithinWindow: true });

const config: VerifyConfig<typeof ApiUtil> = {
  doors: {
    data: null,
    format: {
      globs: ["src/index.ts", "src/rate-limit.ts"],
      funnels: [],
      why: "the 400 default status, the String(err) body, the 429 status and the Retry-After and X-RateLimit-* header names and units are what API clients already parse",
    },
    contract: {
      globs: ["src/index.ts", "src/rate-limit.ts", "package.json"],
      funnels: [],
      why: "assert, assertValidation, RateLimit and RateLimitOptions are what API handlers import, and the peer ranges decide which interface-api and interface-core copies they run against",
    },
    outbound: null,
    exposure: {
      globs: ["src/rate-limit.ts"],
      funnels: [],
      why: "RateLimit decides which requests reach a handler: a change to its counting, its key fallback or its ordering check lets more requests through on every route that uses it",
    },
    publish: {
      globs: ["package.json", ".release-it.json", "changelogen.config.json", ".github/workflows/release.yml"],
      funnels: [],
      why: "the package name and release workflow claim @antelopejs/interface-api-util on npm",
    },
  },
  interface: { calls: CALLS },
  journeys: {
    "assertions-served": served(
      "assert and assertValidation answer a served request with the status and body the docs promise",
      [
        ["GET", "/items/1"],
        ["GET", "/items/2"],
        ["POST", "/plain", { name: "Ada" }],
        ["POST", "/plain", {}],
        ["POST", "/mapped", {}],
        ["POST", "/text", {}],
        ["POST", "/empty", {}],
      ],
      [
        json("GET /items/1", 200, '{"id":"1"}'),
        text("GET /items/2", 404, "Item not found"),
        json("POST /plain", 200, '{"name":"Ada"}'),
        text("POST /plain", 400, "Error: name is required"),
        json("POST /mapped", 422, '{"error":"name is required"}'),
        text("POST /text", 400, "bad input"),
        text("POST /empty", 400, ""),
      ],
    ),
    "validation-edges": scenario(
      "assert passes a truthy condition, and assertValidation keeps promises and rejections as they are",
      VALIDATION_BODY,
      '{"passed":true,"failed":{"status":403,"body":"Forbidden","type":"text/plain"},"plain":{"status":400,"body":"Error: boom","type":"text/plain"},"mapped":{"status":409,"body":"{\\"reason\\":\\"nope\\"}","type":"application/json"},"empty":{"status":400,"body":"","type":"text/plain"},"same":true,"rejection":"later"}',
    ),
    "assertion-types": declared("assert and assertValidation have the documented signatures and inference", ASSERTION_TYPES),
    "rate-limit-served": served(
      "RateLimit counts per key and per handler, answers 429 with Retry-After past the limit and adds the X-RateLimit headers",
      [
        ["GET", "/limited"],
        ["GET", "/limited"],
        ["GET", "/limited"],
        ["GET", "/other"],
        ["GET", "/tenants/a"],
        ["GET", "/tenants/a"],
        ["GET", "/tenants/b"],
        ["GET", "/fallback/a"],
        ["GET", "/fallback/b"],
      ],
      [
        allowed("GET /limited", '{"route":"limited"}', "application/json", "2", "1"),
        allowed("GET /limited", '{"route":"limited"}', "application/json", "2", "0"),
        limited("GET /limited", "Too many requests", "2"),
        allowed("GET /other", '{"route":"other"}', "application/json", "2", "1"),
        allowed("GET /tenants/a", '{"tenant":"a"}', "application/json", "1", "0"),
        limited("GET /tenants/a", "slow down", "1"),
        allowed("GET /tenants/b", '{"tenant":"b"}', "application/json", "1", "0"),
        allowed("GET /fallback/a", '{"tenant":"a"}', "application/json", "1", "0"),
        limited("GET /fallback/b", "Too many requests", "1"),
      ],
    ),
    "rate-limit-ordering": scenario(
      "RateLimit below its route decorator registers, and above it throws when the class is defined",
      ORDERING_BODY,
      '{"below":"registered","above":"@RateLimit must be placed directly beneath its route decorator (@Get, @Post, ...). A route for this handler is already registered, so the rate-limit guard would be ignored."}',
    ),
    "rate-limit-types": declared("RateLimit and RateLimitOptions have the documented shapes", RATE_LIMIT_TYPES),
  },
};

export default config;
