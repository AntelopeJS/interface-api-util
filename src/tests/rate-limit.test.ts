import nodeAssert from "node:assert";
import {
  Controller,
  type ControllerClass,
  ControllerMeta,
  Get,
  HTTPResult,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  hitWindow,
  pruneExpired,
  RateLimit,
  type RateLimitOptions,
  resolveKey,
} from "../rate-limit";

const TOO_MANY_REQUESTS = 429;
const LIMIT = 2;
const WINDOW_MS = 60_000;
const RETRY_AFTER_HEADER = "Retry-After";
const RATELIMIT_LIMIT_HEADER = "X-RateLimit-Limit";
const RATELIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";
const RATELIMIT_RESET_HEADER = "X-RateLimit-Reset";

function toHTTPResult(error: unknown): HTTPResult {
  if (!(error instanceof HTTPResult)) {
    throw new Error("Expected an HTTPResult error");
  }
  return error;
}

function makeContext(remoteAddress?: string): RequestContext {
  return {
    rawRequest: { socket: { remoteAddress } },
    response: new HTTPResult(),
  } as unknown as RequestContext;
}

function captureThrow(action: () => void): unknown {
  try {
    action();
  } catch (error: unknown) {
    return error;
  }
  throw new Error("Expected the action to throw");
}

function guardProvider(
  controller: ControllerClass,
): (context: RequestContext) => unknown {
  const meta = GetMetadata(controller, ControllerMeta);
  const provider = meta.computed_params.handler[0]?.provider;
  if (!provider) {
    throw new Error("Expected a rate-limit provider to be registered");
  }
  return provider;
}

describe("RateLimit", () => {
  describe("hitWindow", () => {
    it("allows up to the limit then denies within the window", () => {
      const store = new Map();
      const first = hitWindow(store, "a", LIMIT, WINDOW_MS, 0);
      const second = hitWindow(store, "a", LIMIT, WINDOW_MS, 10);
      const third = hitWindow(store, "a", LIMIT, WINDOW_MS, 20);

      nodeAssert.equal(first.allowed, true);
      nodeAssert.equal(first.remaining, 1);
      nodeAssert.equal(second.allowed, true);
      nodeAssert.equal(second.remaining, 0);
      nodeAssert.equal(third.allowed, false);
      nodeAssert.equal(third.remaining, 0);
    });

    it("reports the time remaining until the window resets", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1000);
      const decision = hitWindow(store, "a", LIMIT, WINDOW_MS, 1500);

      nodeAssert.equal(decision.resetMs, WINDOW_MS - 500);
    });

    it("resets the window once it has elapsed", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1);
      const denied = hitWindow(store, "a", LIMIT, WINDOW_MS, 2);
      const afterReset = hitWindow(store, "a", LIMIT, WINDOW_MS, WINDOW_MS + 5);

      nodeAssert.equal(denied.allowed, false);
      nodeAssert.equal(afterReset.allowed, true);
      nodeAssert.equal(afterReset.remaining, 1);
    });

    it("tracks each key independently", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1);
      const otherKey = hitWindow(store, "b", LIMIT, WINDOW_MS, 2);

      nodeAssert.equal(otherKey.allowed, true);
      nodeAssert.equal(otherKey.remaining, 1);
    });
  });

  describe("pruneExpired", () => {
    it("removes only windows whose duration has fully elapsed", () => {
      const store = new Map();
      hitWindow(store, "old", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "fresh", LIMIT, WINDOW_MS, WINDOW_MS);

      pruneExpired(store, WINDOW_MS, WINDOW_MS + 1);

      nodeAssert.equal(store.has("old"), false);
      nodeAssert.equal(store.has("fresh"), true);
    });
  });

  describe("resolveKey", () => {
    it("uses the custom key function when provided", () => {
      const options: RateLimitOptions = { key: () => "custom" };
      nodeAssert.equal(resolveKey(makeContext("1.2.3.4"), options), "custom");
    });

    it("falls back to the client IP", () => {
      nodeAssert.equal(resolveKey(makeContext("1.2.3.4"), {}), "1.2.3.4");
    });

    it("uses a fallback key when the IP is unknown", () => {
      nodeAssert.equal(resolveKey(makeContext(undefined), {}), "unknown");
    });

    it("falls back to the client IP when the custom key is falsy", () => {
      const options: RateLimitOptions = {
        key: () => undefined as unknown as string,
      };
      nodeAssert.equal(resolveKey(makeContext("1.2.3.4"), options), "1.2.3.4");
    });
  });

  describe("decorator", () => {
    it("registers a guard provider at the trailing parameter index", () => {
      class Indexed extends Controller("rate-limit-index") {
        handler() {}
      }
      const proto = Indexed.prototype;
      SetParameterProvider(proto, "handler", 0, () => "existing");
      RateLimit(LIMIT, WINDOW_MS)(proto, "handler", {
        value: proto.handler,
      } as PropertyDescriptor);

      const meta = GetMetadata(Indexed, ControllerMeta);
      nodeAssert.ok(meta.computed_params.handler[1]?.provider);
    });

    it("passes while under the limit and throws 429 once exceeded", () => {
      class Limited extends Controller("rate-limit-behavior") {
        @RateLimit(LIMIT, WINDOW_MS)
        handler() {
          return new HTTPResult(200, "ok");
        }
      }
      const provider = guardProvider(Limited);
      const context = makeContext("9.9.9.9");

      nodeAssert.equal(provider(context), undefined);
      nodeAssert.equal(provider(context), undefined);

      const error = toHTTPResult(captureThrow(() => provider(context)));
      const headers = error.getHeaders();
      const retryAfter = Number(headers[RETRY_AFTER_HEADER]);
      nodeAssert.equal(error.getStatus(), TOO_MANY_REQUESTS);
      nodeAssert.equal(headers[RATELIMIT_LIMIT_HEADER], String(LIMIT));
      nodeAssert.equal(headers[RATELIMIT_REMAINING_HEADER], "0");
      nodeAssert.ok(retryAfter > 0);
      nodeAssert.ok(Number(headers[RATELIMIT_RESET_HEADER]) > retryAfter);
    });

    it("emits rate-limit headers on the successful response", () => {
      class Counted extends Controller("rate-limit-headers") {
        @RateLimit(LIMIT, WINDOW_MS)
        handler() {}
      }
      const provider = guardProvider(Counted);
      const context = makeContext("5.5.5.5");

      nodeAssert.equal(provider(context), undefined);

      const headers = context.response.getHeaders();
      nodeAssert.equal(headers[RATELIMIT_LIMIT_HEADER], String(LIMIT));
      nodeAssert.equal(headers[RATELIMIT_REMAINING_HEADER], String(LIMIT - 1));
      nodeAssert.ok(Number(headers[RATELIMIT_RESET_HEADER]) > 0);
    });

    it("keys requests separately so other clients are unaffected", () => {
      class Scoped extends Controller("rate-limit-scope") {
        @RateLimit(LIMIT, WINDOW_MS)
        handler() {}
      }
      const provider = guardProvider(Scoped);

      provider(makeContext("1.1.1.1"));
      provider(makeContext("1.1.1.1"));
      nodeAssert.equal(provider(makeContext("2.2.2.2")), undefined);
    });

    it("throws at decoration time when placed above its route decorator", () => {
      class Misordered extends Controller("rate-limit-misorder") {
        handler() {}
      }
      const proto = Misordered.prototype;
      const descriptor = { value: proto.handler } as PropertyDescriptor;

      Get()(proto, "handler", descriptor);

      nodeAssert.throws(
        () => RateLimit(LIMIT, WINDOW_MS)(proto, "handler", descriptor),
        /directly beneath/,
      );
    });
  });
});
