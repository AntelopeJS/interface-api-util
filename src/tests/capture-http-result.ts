import type { HTTPResult } from "@antelopejs/interface-api";

/**
 * Whether `value` is an `HTTPResult`, whichever copy of the interface package built it.
 */
function isHTTPResult(value: unknown): value is HTTPResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "getStatus" in value &&
    typeof value.getStatus === "function" &&
    "getBody" in value &&
    typeof value.getBody === "function" &&
    "getContentType" in value &&
    typeof value.getContentType === "function" &&
    "getHeaders" in value &&
    typeof value.getHeaders === "function" &&
    "sendResponse" in value &&
    typeof value.sendResponse === "function"
  );
}

export function captureHTTPResult(action: () => void): HTTPResult {
  try {
    action();
  } catch (error: unknown) {
    if (isHTTPResult(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the action to throw");
}

export async function captureRejectedHTTPResult(
  outcome: Promise<unknown>,
): Promise<HTTPResult> {
  try {
    await outcome;
  } catch (error: unknown) {
    if (isHTTPResult(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the outcome to reject");
}
