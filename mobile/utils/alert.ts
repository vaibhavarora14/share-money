import { Alert, AlertButton, Platform } from "react-native";

/**
 * A single action (button) on an alert. Mirrors React Native's AlertButton
 * shape so native platforms can delegate to Alert.alert directly.
 */
export interface AlertAction {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

type WebAlertListener = (
  title: string,
  message: string,
  actions: AlertAction[]
) => void;

let webAlertListener: WebAlertListener | null = null;

/**
 * Registers the web dialog host (see components/AlertHost.tsx).
 * Called once by the host on mount; not for general use.
 */
export function setWebAlertListener(listener: WebAlertListener | null): void {
  webAlertListener = listener;
}

/**
 * Cross-platform replacement for Alert.alert.
 *
 * React Native Web implements Alert.alert as a NO-OP, so alerts raised on the
 * web build silently disappear. This helper delegates to the native
 * Alert.alert on iOS/Android and to a Paper Dialog (rendered by AlertHost)
 * on web, with a window.confirm/alert fallback if the host isn't mounted.
 *
 * @param title - Dialog title
 * @param message - Dialog body text
 * @param actions - Buttons; defaults to a single "OK"
 */
export function showAlert(
  title: string,
  message?: string,
  actions: AlertAction[] = [{ text: "OK", style: "default" }]
): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, actions as AlertButton[]);
    return;
  }

  if (webAlertListener) {
    webAlertListener(title, message ?? "", actions);
    return;
  }

  // Fallback for the unlikely case the host isn't mounted (e.g. very early
  // startup errors): degrade to the browser's built-in dialogs.
  if (typeof window !== "undefined") {
    const text = message ? `${title}\n\n${message}` : title;
    if (actions.length > 1) {
      const confirmAction = actions.find((a) => a.style !== "cancel");
      const cancelAction = actions.find((a) => a.style === "cancel");
      if (window.confirm(text)) {
        confirmAction?.onPress?.();
      } else {
        cancelAction?.onPress?.();
      }
    } else {
      window.alert(text);
      actions[0]?.onPress?.();
    }
  }
}
