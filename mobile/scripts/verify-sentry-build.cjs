const {
  validateSentryBuildEnvironment,
} = require("../config/sentryBuildConfig.cjs");

try {
  const { required, profile } = validateSentryBuildEnvironment(process.env);
  console.log(
    required
      ? `[Sentry] Release upload preflight passed for ${profile}.`
      : `[Sentry] Source-map upload credentials are optional for ${profile}.`,
  );
} catch (error) {
  console.error(`[Sentry] ${error.message}`);
  process.exit(1);
}
