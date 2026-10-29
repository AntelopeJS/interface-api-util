import assert from "node:assert";
import { assert as assertCondition, assertValidation } from "..";
import { captureHTTPResult } from "./capture-http-result";

class RawPayload {
  constructor(
    readonly name: string,
    readonly active: boolean,
  ) {}
}

interface ValidatedPayload {
  name: string;
  active: boolean;
}

interface ValidationErrorPayload {
  code: string;
  detail: string;
}

const BAD_REQUEST_CODE = 400;
const UNPROCESSABLE_ENTITY_CODE = 422;
const ASSERTION_ERROR_MESSAGE = "Missing payload";
const VALIDATION_ERROR_MESSAGE = "Invalid payload";
const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

function parsePayload(
  body: Parameters<typeof assertValidation>[0],
): ValidatedPayload {
  if (!(body instanceof RawPayload)) {
    throw new Error(VALIDATION_ERROR_MESSAGE);
  }

  return {
    name: body.name,
    active: body.active,
  };
}

function countBytes(body: Buffer): number {
  return body.length;
}

function mapValidationError(): ValidationErrorPayload {
  return {
    code: VALIDATION_ERROR_CODE,
    detail: VALIDATION_ERROR_MESSAGE,
  };
}

describe("API Util Interface", () => {
  describe("assert", () => {
    it("returns when the condition is truthy", () => {
      assert.doesNotThrow(() =>
        assertCondition(true, BAD_REQUEST_CODE, ASSERTION_ERROR_MESSAGE),
      );
    });

    it("throws HTTPResult when the condition is falsy", () => {
      const httpError = captureHTTPResult(() =>
        assertCondition(false, BAD_REQUEST_CODE, ASSERTION_ERROR_MESSAGE),
      );

      assert.equal(httpError.getStatus(), BAD_REQUEST_CODE);
      assert.equal(httpError.getBody(), ASSERTION_ERROR_MESSAGE);
    });
  });

  describe("assertValidation", () => {
    it("returns parsed payload when validation succeeds", () => {
      const input = new RawPayload("antelope", true);
      const payload = assertValidation(input, parsePayload);

      assert.notEqual(payload, input);
      assert.equal(payload.name, "antelope");
      assert.equal(payload.active, true);
    });

    it("hands the validator a body of the caller's own type", () => {
      const byteCount = assertValidation(Buffer.from("antelope"), countBytes);

      assert.equal(byteCount, "antelope".length);
    });

    it("throws HTTPResult with default code and serialized error message", () => {
      const httpError = captureHTTPResult(() =>
        assertValidation({}, parsePayload),
      );

      assert.equal(httpError.getStatus(), BAD_REQUEST_CODE);
      assert.equal(httpError.getBody(), `Error: ${VALIDATION_ERROR_MESSAGE}`);
    });

    it("applies custom error mapper and status code", () => {
      const httpError = captureHTTPResult(() =>
        assertValidation(
          {},
          parsePayload,
          mapValidationError,
          UNPROCESSABLE_ENTITY_CODE,
        ),
      );

      assert.equal(httpError.getStatus(), UNPROCESSABLE_ENTITY_CODE);
      assert.equal(httpError.getBody(), JSON.stringify(mapValidationError()));
    });
  });
});
