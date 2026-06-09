import {
  ControllerMeta,
  getRegisteredRoutes,
  HTTPResult,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { MakeMethodDecorator } from "@antelopejs/interface-core/decorators";

const TOO_MANY_REQUESTS = 429;
const DEFAULT_MESSAGE = "Too many requests";
const UNKNOWN_KEY = "unknown";
const MILLISECONDS_PER_SECOND = 1000;
const RETRY_AFTER_HEADER = "Retry-After";
const RATELIMIT_LIMIT_HEADER = "X-RateLimit-Limit";
const RATELIMIT_REMAINING_HEADER = "X-RateLimit-Remaining";
const RATELIMIT_RESET_HEADER = "X-RateLimit-Reset";
const ORDERING_ERROR =
  "@RateLimit must be placed directly beneath its route decorator (@Get, @Post, ...). " +
  "A route for this handler is already registered, so the rate-limit guard would be ignored.";

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Options for the {@link RateLimit} decorator.
 */
export interface RateLimitOptions {
  /**
   * Derive the rate-limit key from the request context. When omitted, or when
   * it returns a falsy value, the client IP
   * (`context.rawRequest.socket.remoteAddress`) is used. Provide a custom
   * function to key by user id, API key, or a forwarded header. The return
   * type allows `null`/`undefined` so optional sources (a missing route
   * parameter or header) can be returned directly without a cast.
   */
  key?: (context: RequestContext) => string | null | undefined;

  /**
   * Body sent with the `429` response. Defaults to `"Too many requests"`.
   */
  message?: string;
}

/**
 * Apply the fixed-window algorithm to a single key.
 *
 * The window resets lazily on access once `windowMs` has elapsed since it
 * started. `now` is passed in so callers (and tests) control the clock.
 *
 * @internal
 */
export function hitWindow(
  store: Map<string, RateLimitWindow>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitDecision {
  const existing = store.get(key);
  const isActive =
    existing !== undefined && now - existing.windowStart < windowMs;
  const window = isActive ? existing : { count: 0, windowStart: now };
  window.count += 1;
  store.set(key, window);
  return {
    allowed: window.count <= limit,
    remaining: Math.max(0, limit - window.count),
    resetMs: window.windowStart + windowMs - now,
  };
}

/**
 * Drop windows that have fully elapsed, bounding the store to the keys seen
 * within the current window rather than letting it grow forever.
 *
 * @internal
 */
export function pruneExpired(
  store: Map<string, RateLimitWindow>,
  windowMs: number,
  now: number,
): void {
  for (const [key, window] of store) {
    if (now - window.windowStart >= windowMs) {
      store.delete(key);
    }
  }
}

/**
 * Resolve the rate-limit key for a request, falling back to the client IP when
 * no custom key is provided or the custom key yields a falsy value.
 *
 * @internal
 */
export function resolveKey(
  context: RequestContext,
  options: RateLimitOptions,
): string {
  const custom = options.key?.(context);
  if (custom) {
    return custom;
  }
  return context.rawRequest.socket.remoteAddress ?? UNKNOWN_KEY;
}

function applyRateLimitHeaders(
  target: HTTPResult,
  limit: number,
  decision: RateLimitDecision,
  now: number,
): void {
  const resetEpochSeconds = Math.ceil(
    (now + decision.resetMs) / MILLISECONDS_PER_SECOND,
  );
  target.addHeader(RATELIMIT_LIMIT_HEADER, String(limit));
  target.addHeader(RATELIMIT_REMAINING_HEADER, String(decision.remaining));
  target.addHeader(RATELIMIT_RESET_HEADER, String(resetEpochSeconds));
}

function buildLimitResult(
  limit: number,
  decision: RateLimitDecision,
  now: number,
  options: RateLimitOptions,
): HTTPResult {
  const result = new HTTPResult(
    TOO_MANY_REQUESTS,
    options.message ?? DEFAULT_MESSAGE,
  );
  const retryAfterSeconds = Math.ceil(
    decision.resetMs / MILLISECONDS_PER_SECOND,
  );
  result.addHeader(RETRY_AFTER_HEADER, String(retryAfterSeconds));
  applyRateLimitHeaders(result, limit, decision, now);
  return result;
}

function getControllerMeta(target: { constructor: unknown }): ControllerMeta {
  return GetMetadata(target.constructor as never, ControllerMeta);
}

function assertGuardWiringOrder(meta: ControllerMeta, key: PropertyKey): void {
  const name = String(key);
  const alreadyRouted = getRegisteredRoutes().some(
    (route) =>
      route.properties === meta.computed_props && route.callbackName === name,
  );
  if (alreadyRouted) {
    throw new Error(ORDERING_ERROR);
  }
}

function nextFreeIndex(meta: ControllerMeta, key: PropertyKey): number {
  const params = meta.computed_params[key];
  if (!params) {
    return 0;
  }
  const indices = Object.keys(params).map((value) =>
    Number.parseInt(value, 10),
  );
  return indices.length === 0 ? 0 : Math.max(...indices) + 1;
}

/**
 * Rate-limit a route handler using a fixed window, counted per client.
 *
 * Each decorated handler keeps an in-memory, per-process count of requests for
 * every key within a `windowMs` window. Successful responses carry the
 * `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`
 * (epoch seconds) headers so clients can self-pace. Once the count exceeds
 * `limit`, the handler instead throws an `HTTPResult` with status `429` (adding
 * a `Retry-After` header) without running, exactly like `assert`. Elapsed
 * windows are pruned periodically, so the store is bounded by the keys seen
 * within a single window (counts are not shared across processes).
 *
 * Place `@RateLimit` **directly beneath** the route decorator. The route
 * decorator captures the handler's parameters when it is applied, so a
 * `@RateLimit` placed above it would be ignored — this is detected at startup
 * and throws rather than silently leaving the route unprotected.
 *
 * @param limit Maximum number of requests allowed per window
 * @param windowMs Window duration in milliseconds
 * @param options Optional custom key function and `429` message
 * @throws {HTTPResult} Status `429` when the limit is exceeded
 * @throws {Error} At decoration time if placed above its route decorator
 *
 * Example:
 * ```ts
 * @Get("users")
 * @RateLimit(100, 60_000)
 * getUsers() {
 *   return new HTTPResult(200, { users: [] });
 * }
 *
 * @Post("login")
 * @RateLimit(5, 60_000, { key: (ctx) => ctx.routeParameters.tenant })
 * login() {
 *   return new HTTPResult(200, { ok: true });
 * }
 * ```
 */
export const RateLimit = MakeMethodDecorator(
  (
    target,
    key,
    _descriptor,
    limit: number,
    windowMs: number,
    options?: RateLimitOptions,
  ) => {
    const resolvedOptions = options ?? {};
    const meta = getControllerMeta(target);
    assertGuardWiringOrder(meta, key);
    const store = new Map<string, RateLimitWindow>();
    let lastSweep = 0;
    const index = nextFreeIndex(meta, key);
    SetParameterProvider(target, key, index, (context) => {
      const now = Date.now();
      if (now - lastSweep >= windowMs) {
        pruneExpired(store, windowMs, now);
        lastSweep = now;
      }
      const decision = hitWindow(
        store,
        resolveKey(context, resolvedOptions),
        limit,
        windowMs,
        now,
      );
      if (!decision.allowed) {
        throw buildLimitResult(limit, decision, now, resolvedOptions);
      }
      if (context.response) {
        applyRateLimitHeaders(context.response, limit, decision, now);
      }
      return undefined;
    });
  },
);
