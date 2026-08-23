import { assertEquals } from "jsr:@std/assert@1";
import {
  buildSocialAuthTelemetry,
  classifySocialAuthFailure,
  getSocialAuthUserMessage,
} from "./socialAuth.ts";

Deno.test("Google cancellation is expected", () => {
  assertEquals(
    classifySocialAuthFailure({
      provider: "google",
      stage: "browser_session",
      cancelled: true,
    }).kind,
    "cancelled",
  );
});

Deno.test("telemetry payload is grouped and excludes raw auth material", () => {
  const rawSecret = "nonce-and-identity-token-must-not-appear";
  const failure = classifySocialAuthFailure({
    provider: "apple",
    stage: "native_request",
    code: "ERR_REQUEST_UNKNOWN",
    message: rawSecret,
  });
  const telemetry = buildSocialAuthTelemetry(failure, "attempt-123", {
    release: "2.20.1",
    build_number: "78",
    device_type: "physical",
  });

  assertEquals(telemetry.fingerprint, ["auth.apple.apple_unknown"]);
  assertEquals(telemetry.tags.auth_provider, "apple");
  assertEquals(telemetry.tags.auth_stage, "native_request");
  assertEquals(telemetry.tags.auth_code, "ERR_REQUEST_UNKNOWN");
  assertEquals(telemetry.extra.auth_attempt_id, "attempt-123");
  assertEquals(JSON.stringify(telemetry).includes(rawSecret), false);
});

Deno.test("untrusted error codes cannot become Sentry tags", () => {
  assertEquals(
    classifySocialAuthFailure({
      provider: "apple",
      stage: "native_request",
      code: "identity-token=secret value",
    }).code,
    "unknown",
  );
});

Deno.test("exact Android browser resolution failure is stable", () => {
  const failure = classifySocialAuthFailure({
    provider: "google",
    stage: "browser_session",
    message: "No matching browser activity found to handle intent",
  });

  assertEquals(failure.kind, "browser_unavailable");
  assertEquals(failure.group, "auth.google.browser_unavailable");
  assertEquals(
    getSocialAuthUserMessage(failure),
    "No supported browser is available. Install or enable Chrome (or another browser), then try Google sign-in again.",
  );
});

Deno.test("Apple cancellation code creates no actionable failure", () => {
  assertEquals(
    classifySocialAuthFailure({
      provider: "apple",
      stage: "native_request",
      code: "ERR_REQUEST_CANCELED",
    }).kind,
    "cancelled",
  );
});

Deno.test("Apple unknown request code is grouped and retryable", () => {
  const failure = classifySocialAuthFailure({
    provider: "apple",
    stage: "native_request",
    code: "ERR_REQUEST_UNKNOWN",
    message: "The operation couldn’t be completed for an unknown reason",
  });

  assertEquals(failure.kind, "apple_unknown");
  assertEquals(failure.group, "auth.apple.apple_unknown");
  assertEquals(
    getSocialAuthUserMessage(failure),
    "Apple sign-in couldn’t be completed. Please try again, or use email or Google sign-in.",
  );
});

Deno.test("provider configuration failures are separated from unexpected failures", () => {
  assertEquals(
    classifySocialAuthFailure({
      provider: "google",
      stage: "provider_request",
      message: "Unsupported provider: provider is not enabled",
    }).kind,
    "provider_configuration",
  );
  assertEquals(
    classifySocialAuthFailure({
      provider: "apple",
      stage: "session_verification",
      message: "Session was not created",
    }).kind,
    "unexpected",
  );
});
