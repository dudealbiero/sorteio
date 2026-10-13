"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hashPassword, shouldUseSecureCookie, verifyPassword } = require("../src/services/authService");

test("hashes passwords with distinct salts and verifies only matching credentials", () => {
  const firstHash = hashPassword("correct horse battery staple");
  const secondHash = hashPassword("correct horse battery staple");
  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyPassword("correct horse battery staple", firstHash), true);
  assert.equal(verifyPassword("incorrect password", firstHash), false);
});

test("marks session cookies secure in production or for secure requests", () => {
  const previousEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(shouldUseSecureCookie({ secure: false }), true);
    process.env.NODE_ENV = "development";
    assert.equal(shouldUseSecureCookie({ secure: true }), true);
    assert.equal(shouldUseSecureCookie({ secure: false }), false);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
