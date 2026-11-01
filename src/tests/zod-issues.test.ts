import assert from "node:assert";
import * as z from "zod";
import { zodIssuesJson } from "..";

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
