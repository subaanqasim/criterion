import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorized } from "../src/auth.js";

test("accepts the configured bearer token", () => {
  assert.equal(isAuthorized("Bearer service-secret", "service-secret"), true);
  assert.equal(isAuthorized("bearer service-secret", "service-secret"), true);
});

test("rejects missing and invalid authorization", () => {
  assert.equal(isAuthorized(undefined, "service-secret"), false);
  assert.equal(isAuthorized("Bearer", "service-secret"), false);
  assert.equal(isAuthorized("Basic service-secret", "service-secret"), false);
  assert.equal(isAuthorized("Bearer wrong-secret", "service-secret"), false);
});
