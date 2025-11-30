import { Alert } from "react-native";
import { getUserFriendlyErrorMessage, isSessionExpiredError } from "./errorMessages";

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
    // Sign out immediately for session expiration - don't wait for user interaction
    signOut().catch((signOutError) => {
      console.error("Error signing out on session expiration:", signOutError);
    });

    // Show alert to inform user (sign out already happened)
    Alert.alert(
      title,
      message,
      [{ text: "OK", style: "default" }]
    );
  } else {
    Alert.alert(title, message, [{ text: "OK", style: "default" }]);
  }
}

