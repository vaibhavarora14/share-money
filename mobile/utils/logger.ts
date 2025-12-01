import * as Sentry from "@sentry/react-native";

type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  message: string,
  data?: Record<string, any>,
  level: LogLevel = "info"
) {
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
}

export function logError(
  error: unknown,
  context?: Record<string, any>
) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(error, context || "");
  }

  const err =
    error instanceof Error ? error : new Error(String(error ?? "Unknown error"));

  Sentry.captureException(err, {
    extra: context,
  });
}

