const assert = require("node:assert/strict");
const test = require("node:test");

test("effective Expo configuration never contains the Sentry auth token", () => {
  const previousToken = process.env.SENTRY_AUTH_TOKEN;
  const secret = "secret-sentry-token-must-not-be-public";
  process.env.SENTRY_AUTH_TOKEN = secret;

  try {
    const makeConfig = require("../app.config.js");
    const result = makeConfig({ config: { expo: {} } });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  } finally {
    if (previousToken === undefined) {
      delete process.env.SENTRY_AUTH_TOKEN;
    } else {
      process.env.SENTRY_AUTH_TOKEN = previousToken;
    }
  }
});
