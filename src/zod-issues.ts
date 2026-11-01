import type { HTTPBody } from "@antelopejs/interface-api";

/** The shape of a zod issue that `zodIssuesJson` relies on; zod's `ZodIssue` fits. */
interface IssueLike {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Whether a value is a JSON value, exactly: what `HTTPBody` accepts without a `toJSON` method.
 *
 * @param value Any value
 * @returns Whether `value` is an `HTTPBody` of JSON values
 */
export function isHTTPBody(value: unknown): value is HTTPBody {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return Array.from(value.keys()).every(
      (index) => Object.hasOwn(value, index) && isHTTPBody(value[index]),
    );
  }
  return isPlainObject(value) && Object.values(value).every(isHTTPBody);
}

/**
 * Zod's issues as the JSON value `JSON.stringify` writes for them, so a body
 * holding it serializes byte for byte as one holding the issues. A `ZodError`
 * nested in an issue (`unionErrors`, `argumentsError`, `returnTypeError`)
 * becomes its enumerable fields, `issues` and `name`.
 *
 * @param issues The issues of a `ZodError`
 * @returns The issues as an `HTTPBody`
 */
export function zodIssuesJson(issues: readonly IssueLike[]): HTTPBody {
  const json: unknown = JSON.parse(JSON.stringify(issues));
  if (!isHTTPBody(json)) {
    throw new TypeError("zod issues did not serialize to JSON");
  }
  return json;
}
