import assert from "node:assert";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  Controller,
  type ControllerClass,
  ControllerMeta,
  Get,
  HTTPResult,
  type ParameterProvider,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";

import {
  hitWindow,
  pruneExpired,
  RateLimit,
  type RateLimitOptions,
  resolveKey,
} from "../rate-limit";
import { captureHTTPResult } from "./capture-http-result";

const TOO_MANY_REQUESTS = 429;
const LIMIT = 2;
const WINDOW_MS = 60_000;
const RETRY_AFTER_HEADER = "Retry-After";
const RATELIMIT_LIMIT_HEADER = "X-RateLimit-Limit";
const RATELIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";
const RATELIMIT_RESET_HEADER = "X-RateLimit-Reset";

function makeContext(remoteAddress?: string): RequestContext {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: remoteAddress });
  const rawRequest = new IncomingMessage(socket);
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://localhost/"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

function handlerDescriptor(controller: ControllerClass): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller.prototype,
    "handler",
  );
  if (!descriptor) {
    throw new Error("Expected handler to be a declared method");
  }
  return descriptor;
}

function guardProvider(controller: ControllerClass): ParameterProvider {
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

      assert.equal(first.allowed, true);
      assert.equal(first.remaining, 1);
      assert.equal(second.allowed, true);
      assert.equal(second.remaining, 0);
      assert.equal(third.allowed, false);
      assert.equal(third.remaining, 0);
    });

    it("reports the time remaining until the window resets", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1000);
      const decision = hitWindow(store, "a", LIMIT, WINDOW_MS, 1500);

      assert.equal(decision.resetMs, WINDOW_MS - 500);
    });

    it("resets the window once it has elapsed", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1);
      const denied = hitWindow(store, "a", LIMIT, WINDOW_MS, 2);
      const afterReset = hitWindow(store, "a", LIMIT, WINDOW_MS, WINDOW_MS + 5);

      assert.equal(denied.allowed, false);
      assert.equal(afterReset.allowed, true);
      assert.equal(afterReset.remaining, 1);
    });

    it("tracks each key independently", () => {
      const store = new Map();
      hitWindow(store, "a", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "a", LIMIT, WINDOW_MS, 1);
      const otherKey = hitWindow(store, "b", LIMIT, WINDOW_MS, 2);

      assert.equal(otherKey.allowed, true);
      assert.equal(otherKey.remaining, 1);
    });
  });

  describe("pruneExpired", () => {
    it("removes only windows whose duration has fully elapsed", () => {
      const store = new Map();
      hitWindow(store, "old", LIMIT, WINDOW_MS, 0);
      hitWindow(store, "fresh", LIMIT, WINDOW_MS, WINDOW_MS);

      pruneExpired(store, WINDOW_MS, WINDOW_MS + 1);

      assert.equal(store.has("old"), false);
      assert.equal(store.has("fresh"), true);
    });
  });

  describe("resolveKey", () => {
    it("uses the custom key function when provided", () => {
      const options: RateLimitOptions = { key: () => "custom" };
      assert.equal(resolveKey(makeContext("1.2.3.4"), options), "custom");
    });

    it("falls back to the client IP", () => {
      assert.equal(resolveKey(makeContext("1.2.3.4"), {}), "1.2.3.4");
    });

    it("uses a fallback key when the IP is unknown", () => {
      assert.equal(resolveKey(makeContext(undefined), {}), "unknown");
    });

    it("falls back to the client IP when the custom key is falsy", () => {
      const options: RateLimitOptions = { key: () => undefined };
      assert.equal(resolveKey(makeContext("1.2.3.4"), options), "1.2.3.4");
    });
  });

  describe("decorator", () => {
    it("registers a guard provider at the trailing parameter index", () => {
      class Indexed extends Controller("rate-limit-index") {
        handler() {}
      }
      const proto = Indexed.prototype;
      SetParameterProvider(proto, "handler", 0, () => "existing");
      RateLimit(LIMIT, WINDOW_MS)(proto, "handler", handlerDescriptor(Indexed));

      const meta = GetMetadata(Indexed, ControllerMeta);
      assert.ok(meta.computed_params.handler[1]?.provider);
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

      assert.equal(provider(context), undefined);
      assert.equal(provider(context), undefined);

      const error = captureHTTPResult(() => provider(context));
      const headers = error.getHeaders();
      const retryAfter = Number(headers[RETRY_AFTER_HEADER]);
      assert.equal(error.getStatus(), TOO_MANY_REQUESTS);
      assert.equal(headers[RATELIMIT_LIMIT_HEADER], String(LIMIT));
      assert.equal(headers[RATELIMIT_REMAINING_HEADER], "0");
      assert.ok(retryAfter > 0);
      assert.ok(Number(headers[RATELIMIT_RESET_HEADER]) > retryAfter);
    });

    it("emits rate-limit headers on the successful response", () => {
      class Counted extends Controller("rate-limit-headers") {
        @RateLimit(LIMIT, WINDOW_MS)
        handler() {}
      }
      const provider = guardProvider(Counted);
      const context = makeContext("5.5.5.5");

      assert.equal(provider(context), undefined);

      const headers = context.response.getHeaders();
      assert.equal(headers[RATELIMIT_LIMIT_HEADER], String(LIMIT));
      assert.equal(headers[RATELIMIT_REMAINING_HEADER], String(LIMIT - 1));
      assert.ok(Number(headers[RATELIMIT_RESET_HEADER]) > 0);
    });

    it("keys requests separately so other clients are unaffected", () => {
      class Scoped extends Controller("rate-limit-scope") {
        @RateLimit(LIMIT, WINDOW_MS)
        handler() {}
      }
      const provider = guardProvider(Scoped);

      provider(makeContext("1.1.1.1"));
      provider(makeContext("1.1.1.1"));
      assert.equal(provider(makeContext("2.2.2.2")), undefined);
    });

    it("throws at decoration time when placed above its route decorator", () => {
      class Misordered extends Controller("rate-limit-misorder") {
        handler() {}
      }
      const proto = Misordered.prototype;
      const descriptor = handlerDescriptor(Misordered);

      Get()(proto, "handler", descriptor);

      assert.throws(
        () => RateLimit(LIMIT, WINDOW_MS)(proto, "handler", descriptor),
        /directly beneath/,
      );
    });
  });
});
