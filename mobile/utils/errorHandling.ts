import { Alert } from "react-native";
import { isSessionExpiredError, getUserFriendlyErrorMessage } from "./errorMessages";

/**
 * Shows an error alert and automatically signs out if the error indicates session expiration
 * @param error - The error to display
 * @param signOut - Function to sign out the user
 * @param title - Optional title for the alert (defaults to "Error")
 */
export function showErrorAlert(
  error: unknown,
  signOut: () => Promise<void>,
  title: string = "Error"
): void {
  const message = getUserFriendlyErrorMessage(error);
  const isSessionExpired = isSessionExpiredError(error);

  if (isSessionExpired) {
    Alert.alert(
      title,
      message,
      [
        {
          text: "OK",
          style: "default",
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  } else {
    Alert.alert(title, message, [{ text: "OK", style: "default" }]);
  }
}

