import assert from "node:assert";
import { request } from "node:http";
import {
  Controller,
  HTTPResult,
  JSONBody,
  Post,
} from "@antelopejs/interface-api";

import { RateLimit } from "../rate-limit";

const SERVER = "http://127.0.0.1:5010";
const BODY_LIMIT_BYTES = 16;
const OVERSIZED_BODY = JSON.stringify({ padding: "x".repeat(64) });
const PAYLOAD_TOO_LARGE = 413;
const TOO_MANY_REQUESTS = 429;

export class GuardedUpload extends Controller("/rate-limit-http") {
  @Post("upload")
  @RateLimit(1, 60_000)
  upload(@JSONBody(BODY_LIMIT_BYTES) body: unknown) {
    return new HTTPResult(200, JSON.stringify(body));
  }
}

interface Answer {
  status: number;
  retryAfter: string | string[] | undefined;
}

function postOversized(path: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${SERVER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    outgoing.on("response", (response) => {
      response.resume();
      resolve({
        status: response.statusCode ?? 0,
        retryAfter: response.headers["retry-after"],
      });
    });
    outgoing.on("error", reject);
    outgoing.end(OVERSIZED_BODY);
  });
}

function collectUnhandledRejections() {
  const reasons: unknown[] = [];
  const onRejection: NodeJS.UnhandledRejectionListener = (reason) => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  return {
    reasons,
    stop: () => process.off("unhandledRejection", onRejection),
  };
}

describe("RateLimit over HTTP", () => {
  it("answers 429 without leaving the failed body read unhandled", async () => {
    const rejections = collectUnhandledRejections();
    try {
      const path = "/rate-limit-http/upload";
      const first = await postOversized(path);
      const limited = await postOversized(path);
      const afterLimit = await postOversized(path);

      assert.equal(first.status, PAYLOAD_TOO_LARGE);
      assert.equal(limited.status, TOO_MANY_REQUESTS);
      assert.ok(Number(limited.retryAfter) > 0);
      assert.equal(afterLimit.status, TOO_MANY_REQUESTS);
      assert.deepEqual(rejections.reasons, []);
    } finally {
      rejections.stop();
    }
  });
});
