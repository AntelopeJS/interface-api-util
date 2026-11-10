import { HTTPResult } from "@antelopejs/interface-api";

export function captureHTTPResult(action: () => void): HTTPResult {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof HTTPResult) {
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
    if (error instanceof HTTPResult) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the outcome to reject");
}
