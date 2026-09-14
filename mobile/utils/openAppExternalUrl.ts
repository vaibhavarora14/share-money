import * as WebBrowser from "expo-web-browser";
import { Alert, Linking } from "react-native";
import { logError } from "./logger";
import {
  openExternalUrl,
  type OpenExternalUrlDependencies,
  type OpenExternalUrlOptions,
  type OpenExternalUrlResult,
} from "./openExternalUrl";

const defaultDependencies: OpenExternalUrlDependencies = {
  openBrowserAsync: (url) => WebBrowser.openBrowserAsync(url),
  openURL: (url) => Linking.openURL(url),
  alert: (title, message) => {
    Alert.alert(title, message, [{ text: "OK", style: "default" }]);
  },
  logFailure: (error, context) => {
    logError(error instanceof Error ? error : new Error(String(error)), context);
  },
};

/**
 * App-facing wrapper that opens legal/marketing https links with Expo WebBrowser
 * first and Linking as fallback, including a user-visible error on total failure.
 */
export function openAppExternalUrl(
  url: string,
  options: OpenExternalUrlOptions & {
    dependencies?: Partial<OpenExternalUrlDependencies>;
  } = {},
): Promise<OpenExternalUrlResult> {
  const { dependencies: overrides, ...openOptions } = options;
  return openExternalUrl(
    url,
    {
      ...defaultDependencies,
      ...overrides,
    },
    openOptions,
  );
}
