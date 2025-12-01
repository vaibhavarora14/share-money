import * as Sentry from "@sentry/react-native";

type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  message: string,
  data?: Record<string, any>,
  level: LogLevel = "info"
) {
  try {
    if (__DEV__) {
      // Keep console output in dev for easy debugging
      // eslint-disable-next-line no-console
      console.log(message, data || "");
    }

    // Always send lightweight breadcrumbs to Sentry (dev + prod)
    Sentry.addBreadcrumb({
      level,
      category: "app-log",
      message,
      data,
    });
  } catch (err) {
    // Never let telemetry failures break the app. In dev, surface a warning.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("Failed to log breadcrumb to Sentry:", err);
    }
  }
}

export function logError(
  error: unknown,
  context?: Record<string, any>
) {
  const err =
    error instanceof Error ? error : new Error(String(error ?? "Unknown error"));

  try {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error(err, context || "");
    }

    Sentry.captureException(err, {
      extra: context,
    });
  } catch (captureErr) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("Failed to capture exception in Sentry:", captureErr);
    }
  }
}

