const RELEASE_PROFILES = new Set(["production", "verification"]);

function validateSentryBuildEnvironment(env = process.env) {
  const profile = env.EAS_BUILD_PROFILE || "local";
  const required = RELEASE_PROFILES.has(profile);

  if (required && !env.SENTRY_AUTH_TOKEN?.trim()) {
    throw new Error(
      `SENTRY_AUTH_TOKEN is required for the ${profile} EAS build profile. Configure it as a sensitive EAS production variable.`,
    );
  }

  if (
    required &&
    (env.SENTRY_DISABLE_AUTO_UPLOAD === "true" ||
      env.SENTRY_ALLOW_FAILURE === "true")
  ) {
    throw new Error(
      `The ${profile} build must not disable or ignore Sentry source-map upload failures.`,
    );
  }

  if (
    profile === "production" &&
    env.EXPO_PUBLIC_ENABLE_SENTRY_DIAGNOSTICS === "true"
  ) {
    throw new Error(
      "The internal Sentry diagnostic trigger must be disabled for production builds.",
    );
  }

  return { required, profile };
}

module.exports = { validateSentryBuildEnvironment };
