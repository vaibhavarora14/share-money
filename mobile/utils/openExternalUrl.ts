export type OpenExternalUrlDependencies = {
  openBrowserAsync: (url: string) => Promise<unknown>;
  openURL: (url: string) => Promise<unknown>;
  alert: (title: string, message: string) => void;
  logFailure: (error: unknown, context?: Record<string, unknown>) => void;
};

export type OpenExternalUrlOptions = {
  showUserError?: boolean;
  errorTitle?: string;
};

export type OpenExternalUrlResult =
  | { ok: true; method: "browser" | "linking" }
  | { ok: false; error: string };

export const OPEN_EXTERNAL_URL_ERROR =
  "We couldn’t open that link. Please try again, or visit sharedmoney.app in your browser.";

/**
 * Opens an https/http URL via an injected in-app browser, with Linking fallback.
 * Bare Linking.openURL can reject on iOS (system handoff / same-app universal-link
 * edge cases) and unhandled rejections surface in Sentry as "Unable to open URL: …".
 *
 * Dependencies are injected so unit tests can run without React Native / Expo modules.
 */
export async function openExternalUrl(
  url: string,
  dependencies: OpenExternalUrlDependencies,
  options: OpenExternalUrlOptions = {},
): Promise<OpenExternalUrlResult> {
  const { showUserError = true, errorTitle = "Couldn't open link" } = options;

  try {
    await dependencies.openBrowserAsync(url);
    return { ok: true, method: "browser" };
  } catch (browserError) {
    dependencies.logFailure(browserError, {
      context: "openExternalUrl.browser",
      url,
    });
  }

  try {
    await dependencies.openURL(url);
    return { ok: true, method: "linking" };
  } catch (linkingError) {
    dependencies.logFailure(linkingError, {
      context: "openExternalUrl.linking",
      url,
    });

    if (showUserError) {
      dependencies.alert(errorTitle, OPEN_EXTERNAL_URL_ERROR);
    }

    return { ok: false, error: OPEN_EXTERNAL_URL_ERROR };
  }
}
