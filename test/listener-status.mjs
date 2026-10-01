import assert from "node:assert/strict";
import test from "node:test";
import { isSuccessfulResult, resultError } from "../src/listener.mjs";

test("accepts all successful mcode result statuses", () => {
  for (const status of ["success", "succeeded", "completed", "SUCCEEDED"]) {
    assert.equal(isSuccessfulResult({ status }), true, status);
    assert.equal(resultError({ status, error: "stale error" }), undefined, status);
  }
});

test("keeps failure details for non-success results", () => {
  assert.equal(isSuccessfulResult({ status: "failed" }), false);
  assert.equal(resultError({ status: "failed", error: "connection lost" }), "connection lost");
  assert.equal(resultError({ status: "timeout" }), "timeout");
});
