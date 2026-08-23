const assert = require("node:assert/strict");
const test = require("node:test");

const { validateSentryBuildEnvironment } = require("./sentryBuildConfig.cjs");

test("rejects production and verification builds without a Sentry token", () => {
  for (const profile of ["production", "verification"]) {
    assert.throws(
      () => validateSentryBuildEnvironment({ EAS_BUILD_PROFILE: profile }),
      /SENTRY_AUTH_TOKEN/,
    );
  }
});

test("rejects production source-map upload bypasses", () => {
  assert.throws(
    () =>
      validateSentryBuildEnvironment({
        EAS_BUILD_PROFILE: "production",
        SENTRY_AUTH_TOKEN: "test-token",
        SENTRY_DISABLE_AUTO_UPLOAD: "true",
      }),
    /source-map upload/i,
  );

  assert.throws(
    () =>
      validateSentryBuildEnvironment({
        EAS_BUILD_PROFILE: "production",
        SENTRY_AUTH_TOKEN: "test-token",
        SENTRY_ALLOW_FAILURE: "true",
      }),
    /source-map upload/i,
  );
});

test("rejects a production build with the internal diagnostic trigger enabled", () => {
  assert.throws(
    () =>
      validateSentryBuildEnvironment({
        EAS_BUILD_PROFILE: "production",
        SENTRY_AUTH_TOKEN: "test-token",
        EXPO_PUBLIC_ENABLE_SENTRY_DIAGNOSTICS: "true",
      }),
    /diagnostic/i,
  );
});

test("accepts a configured release build without returning the secret", () => {
  const result = validateSentryBuildEnvironment({
    EAS_BUILD_PROFILE: "production",
    SENTRY_AUTH_TOKEN: "test-token-must-not-leak",
  });

  assert.deepEqual(result, {
    required: true,
    profile: "production",
  });
  assert.doesNotMatch(JSON.stringify(result), /test-token-must-not-leak/);
});

test("allows local development without a Sentry token", () => {
  assert.deepEqual(validateSentryBuildEnvironment({}), {
    required: false,
    profile: "local",
  });
});
