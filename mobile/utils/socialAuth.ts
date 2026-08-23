export type SocialAuthProvider = "google" | "apple";

export type SocialAuthStage =
  | "availability_check"
  | "provider_request"
  | "browser_session"
  | "callback_parse"
  | "native_request"
  | "token_exchange"
  | "profile_update"
  | "session_verification";

export type SocialAuthFailureKind =
  | "cancelled"
  | "browser_unavailable"
  | "apple_unknown"
  | "provider_configuration"
  | "unexpected";

export type SocialAuthFailureInput = {
  provider: SocialAuthProvider;
  stage: SocialAuthStage;
  code?: string;
  message?: string;
  cancelled?: boolean;
};

export type SocialAuthFailure = {
  provider: SocialAuthProvider;
  stage: SocialAuthStage;
  code: string;
  kind: SocialAuthFailureKind;
  group: string;
};

export type SocialAuthTelemetry = {
  message: string;
  level: "warning" | "error";
  fingerprint: string[];
  tags: Record<string, string>;
  extra: { auth_attempt_id: string };
};

export function classifySocialAuthFailure(
  input: SocialAuthFailureInput,
): SocialAuthFailure {
  const rawCode = input.code || "unknown";
  const code = /^[A-Za-z0-9_.:-]{1,80}$/.test(rawCode)
    ? rawCode
    : "unknown";
  const message = input.message?.toLowerCase() || "";
  let kind: SocialAuthFailureKind = "unexpected";

  if (
    input.cancelled ||
    code === "ERR_REQUEST_CANCELED" ||
    message.includes("authentication was cancelled") ||
    message.includes("authentication was canceled")
  ) {
    kind = "cancelled";
  } else if (
    input.provider === "google" &&
    message.includes("no matching browser activity")
  ) {
    kind = "browser_unavailable";
  } else if (
    input.provider === "apple" &&
    code === "ERR_REQUEST_UNKNOWN"
  ) {
    kind = "apple_unknown";
  } else if (
    message.includes("unsupported provider") ||
    message.includes("provider is not enabled") ||
    message.includes("oauth client") ||
    message.includes("client id") ||
    message.includes("redirect uri") ||
    message.includes("nonce configuration")
  ) {
    kind = "provider_configuration";
  }

  return {
    provider: input.provider,
    stage: input.stage,
    code,
    kind,
    group: `auth.${input.provider}.${kind}`,
  };
}

export function buildSocialAuthTelemetry(
  failure: SocialAuthFailure,
  attemptId: string,
  runtimeTags: Record<string, string>,
): SocialAuthTelemetry {
  return {
    message: `Social authentication failure: ${failure.group}`,
    level:
      failure.kind === "browser_unavailable" ||
      failure.kind === "provider_configuration"
        ? "warning"
        : "error",
    fingerprint: [failure.group],
    tags: {
      ...runtimeTags,
      auth_issue: failure.group,
      auth_provider: failure.provider,
      auth_stage: failure.stage,
      auth_code: failure.code,
    },
    extra: {
      auth_attempt_id: attemptId,
    },
  };
}

export function getSocialAuthUserMessage(
  failure: SocialAuthFailure,
): string {
  switch (failure.kind) {
    case "cancelled":
      return "Authentication was cancelled";
    case "browser_unavailable":
      return "No supported browser is available. Install or enable Chrome (or another browser), then try Google sign-in again.";
    case "apple_unknown":
      return "Apple sign-in couldn’t be completed. Please try again, or use email or Google sign-in.";
    case "provider_configuration":
      return "This sign-in method is temporarily unavailable. Please use email or another sign-in method.";
    case "unexpected":
      return failure.provider === "apple"
        ? "Apple sign-in couldn’t be completed. Please try again, or use email or Google sign-in."
        : "Google sign-in couldn’t be completed. Please try again.";
  }
}
