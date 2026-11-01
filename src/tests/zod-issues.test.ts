import assert from "node:assert";
import * as z from "zod";
import { isHTTPBody, zodIssuesJson } from "..";

function issuesOf(
  schema: z.ZodTypeAny,
  value: boolean | Record<string, string | number>,
): z.ZodIssue[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("Expected the schema to refuse");
  return result.error.issues;
}

describe("zodIssuesJson", () => {
  it("writes the bytes JSON.stringify writes for the issues", () => {
    const issues = issuesOf(
      z.object({ name: z.string().min(2), age: z.number().int().positive() }),
      { name: "a", age: -1.5 },
    );

    assert.equal(
      JSON.stringify(zodIssuesJson(issues)),
      '[{"code":"too_small","minimum":2,"type":"string","inclusive":true,"exact":false,"message":"String must contain at least 2 character(s)","path":["name"]},{"code":"invalid_type","expected":"integer","received":"float","message":"Expected integer, received float","path":["age"]},{"code":"too_small","minimum":0,"type":"number","inclusive":false,"exact":false,"message":"Number must be greater than 0","path":["age"]}]',
    );
  });

  it("keeps the name and issues of a ZodError nested in a union issue", () => {
    const issues = issuesOf(z.union([z.string(), z.number()]), true);

    assert.equal(
      JSON.stringify(zodIssuesJson(issues)),
      '[{"code":"invalid_union","unionErrors":[{"issues":[{"code":"invalid_type","expected":"string","received":"boolean","path":[],"message":"Expected string, received boolean"}],"name":"ZodError"},{"issues":[{"code":"invalid_type","expected":"number","received":"boolean","path":[],"message":"Expected number, received boolean"}],"name":"ZodError"}],"path":[],"message":"Invalid input"}]',
    );
  });

  it("answers an empty list as an empty array", () => {
    assert.deepEqual(zodIssuesJson([]), []);
  });
});

class Wrapper {
  readonly value = 1;
}

function sparse(): number[] {
  const holey = [1, 2, 3];
  holey.length = 5;
  return holey;
}

describe("isHTTPBody", () => {
  it("accepts JSON values at any depth", () => {
    assert.equal(isHTTPBody(null), true);
    assert.equal(isHTTPBody("text"), true);
    assert.equal(isHTTPBody(-1.5), true);
    assert.equal(isHTTPBody(false), true);
    assert.equal(isHTTPBody([1, ["a", { b: null }]]), true);
    assert.equal(isHTTPBody({ a: { b: [true] } }), true);
    assert.equal(isHTTPBody(Object.create(null)), true);
    assert.equal(isHTTPBody(JSON.parse('{"__proto__":{"x":1}}')), true);
  });

  it("refuses what JSON.stringify would rewrite or drop", () => {
    assert.equal(isHTTPBody(Number.NaN), false);
    assert.equal(isHTTPBody(Number.POSITIVE_INFINITY), false);
    assert.equal(isHTTPBody({ nested: [Number.NEGATIVE_INFINITY] }), false);
    assert.equal(isHTTPBody(undefined), false);
    assert.equal(isHTTPBody(10n), false);
    assert.equal(isHTTPBody(Symbol("s")), false);
    assert.equal(
      isHTTPBody(() => 1),
      false,
    );
    assert.equal(isHTTPBody({ nested: [undefined] }), false);
  });

  it("refuses a sparse array", () => {
    assert.equal(isHTTPBody(sparse()), false);
  });

  it("refuses objects that are not plain", () => {
    assert.equal(isHTTPBody(new Map([["a", 1]])), false);
    assert.equal(isHTTPBody(new Set([1])), false);
    assert.equal(isHTTPBody(new Wrapper()), false);
    assert.equal(isHTTPBody(new Date(0)), false);
    assert.equal(isHTTPBody(Object(1)), false);
    assert.equal(isHTTPBody(Object("s")), false);
    assert.equal(isHTTPBody(Object(true)), false);
    assert.equal(isHTTPBody({ nested: new Map() }), false);
  });
});
