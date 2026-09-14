import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { getSentryRuntimeTags } from "./sentryDiagnostics";
import {
  buildSocialAuthTelemetry,
  type SocialAuthFailure,
} from "./socialAuth";

export function recordSocialAuthFailure(
  failure: SocialAuthFailure,
  attemptId: string,
  options: { retryCount?: number } = {},
): void {
  if (failure.kind === "cancelled") return;

  const buildNumber =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode?.toString();
  const telemetry = buildSocialAuthTelemetry(
    failure,
    attemptId,
    getSentryRuntimeTags({
      isDevice: Device.isDevice,
      buildProfile: Constants.expoConfig?.extra?.buildProfile,
      release: Constants.expoConfig?.version,
      buildNumber,
      platform: Platform.OS,
    }),
    { retryCount: options.retryCount },
  );

  Sentry.captureMessage(telemetry.message, {
    level: telemetry.level,
    fingerprint: telemetry.fingerprint,
    tags: telemetry.tags,
    extra: telemetry.extra,
  });
}
