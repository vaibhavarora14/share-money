import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

const TOKEN_REFRESH_BUFFER_SECONDS = 60;
const API_URL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Sanitizes error messages to remove sensitive information before showing to users
 */
function sanitizeErrorMessage(message: string): string {
  // Remove stack traces (lines starting with "at" or file paths)
  let sanitized = message
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("at ") &&
        !trimmed.includes("/node_modules/") &&
        !trimmed.includes("\\node_modules\\") &&
        !trimmed.match(/^[A-Z]:\\/) && // Windows absolute paths
        !trimmed.startsWith("/") && // Unix absolute paths (but allow relative)
        !trimmed.match(/^\w+:\/\//) // URLs
      );
    })
    .join("\n")
    .trim();

  // If we filtered everything out, return a generic message
  if (!sanitized) {
    return "An error occurred. Please try again.";
  }

  // Limit message length to prevent UI issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + "...";
  }

  return sanitized;
}

export async function getAuthToken(): Promise<string | null> {
  let {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  if (!currentSession) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = currentSession.expires_at || 0;

  if (expiresAt && expiresAt < now + TOKEN_REFRESH_BUFFER_SECONDS) {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError || !refreshData.session) {
      return null;
    }

    currentSession = refreshData.session;
  }

  return currentSession.access_token;
}

export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!API_URL) {
    throw new Error(
      "Unable to connect to the server. Please check your app configuration and try again."
    );
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    let errorData: any = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText);
        } catch {
          // Not JSON
        }
      }
    } catch {
      // Ignore
    }

    const errorDetails = errorData?.error || errorData?.details || "";
    if (
      errorDetails.includes("session_not_found") ||
      errorDetails.includes("Session from session_id")
    ) {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const authKeys = keys.filter(
          (key: string) => key.includes("supabase") || key.includes("auth")
        );
        if (authKeys.length > 0) {
          await AsyncStorage.multiRemove(authKeys);
        }
      } catch (storageError) {
        console.error("Error clearing AsyncStorage:", storageError);
      }
    }

    throw new Error("Unauthorized");
  }

  if (response.status === 429) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }

  if (!response.ok) {
    let errorData: any = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText);
        } catch {
          // Not JSON, use text as error message
        }
      }
    } catch {
      // Ignore
    }

    const rawErrorMessage =
      errorData?.error ||
      errorData?.message ||
      errorData?.details ||
      `HTTP error! status: ${response.status}`;

    // Sanitize error messages for user-facing display
    // Remove potentially sensitive information like stack traces, file paths, etc.
    const sanitizedMessage = sanitizeErrorMessage(rawErrorMessage);

    throw new Error(sanitizedMessage);
  }

  return response;
}
