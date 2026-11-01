import assert from "node:assert";
import { isHTTPBody, zodIssuesJson } from "..";

/** What `new ZodError(issues)` holds: enumerable `issues` and `name`, plus method properties. */
class ZodErrorLike {
  readonly name = "ZodError";
  readonly addIssue = (): void => undefined;
  constructor(readonly issues: ReadonlyArray<{ message: string }>) {}
}

describe("zodIssuesJson", () => {
  it("writes the bytes JSON.stringify writes for the issues", () => {
    const issues = [
      {
        code: "too_small",
        minimum: 2,
        type: "string",
        inclusive: true,
        exact: false,
        message: "String must contain at least 2 character(s)",
        path: ["name"],
      },
      {
        code: "invalid_type",
        expected: "integer",
        received: "float",
        message: "Expected integer, received float",
        path: ["age", 0],
      },
    ];

    assert.equal(
      JSON.stringify(zodIssuesJson(issues)),
      '[{"code":"too_small","minimum":2,"type":"string","inclusive":true,"exact":false,"message":"String must contain at least 2 character(s)","path":["name"]},{"code":"invalid_type","expected":"integer","received":"float","message":"Expected integer, received float","path":["age",0]}]',
    );
  });

  it("keeps the name and issues of a ZodError nested in a union issue", () => {
    const issues = [
      {
        code: "invalid_union",
        unionErrors: [
          new ZodErrorLike([{ message: "Expected string, received boolean" }]),
          new ZodErrorLike([{ message: "Expected number, received boolean" }]),
        ],
        path: [],
        message: "Invalid input",
      },
    ];

    assert.equal(
      JSON.stringify(zodIssuesJson(issues)),
      '[{"code":"invalid_union","unionErrors":[{"issues":[{"message":"Expected string, received boolean"}],"name":"ZodError"},{"issues":[{"message":"Expected number, received boolean"}],"name":"ZodError"}],"path":[],"message":"Invalid input"}]',
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
