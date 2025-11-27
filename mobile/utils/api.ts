import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { ApiErrorResponse } from "../types/api";

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

  const fullUrl = `${API_URL}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (networkError: any) {
    // Handle network-level errors (connection refused, timeout, DNS failure, etc.)
    const errorName = networkError?.name || "Unknown";
    const errorMessage = networkError?.message || "Network request failed";
    
    if (__DEV__) {
      console.error("[API Network Error]", {
        errorName,
        errorMessage,
        endpoint,
      });
    }

    // Provide helpful error message based on error type
    let userMessage = "Network request failed";
    
    if (errorMessage.includes("Network request failed") || errorName === "TypeError") {
      // This is the generic React Native fetch error
      // Check if it's likely an Android emulator localhost issue
      if (API_URL.includes("localhost") || API_URL.includes("127.0.0.1")) {
        userMessage = "Cannot connect to server. For Android emulator, use 10.0.2.2 instead of localhost in EXPO_PUBLIC_API_URL";
      } else if (API_URL.includes("10.0.0.2")) {
        // Common typo - should be 10.0.2.2 not 10.0.0.2
        userMessage = "Cannot connect to server. IP address typo detected: use 10.0.2.2 (not 10.0.0.2) for Android emulator in EXPO_PUBLIC_API_URL";
      } else if (API_URL.includes("10.0.2.") && !API_URL.includes("10.0.2.2")) {
        userMessage = `Cannot connect to server. For Android emulator, use exactly 10.0.2.2 (found: ${API_URL.match(/10\.0\.2\.\d+/)?.[0] || 'unknown'})`;
      } else {
        userMessage = "Cannot connect to server. Please check:\n- Server is running on port 8888\n- Correct API URL in mobile/.env (use 10.0.2.2 for Android emulator)\n- Network connection";
      }
    } else if (errorMessage.includes("timeout") || errorName === "TimeoutError") {
      userMessage = "Request timed out. The server may be slow or unreachable.";
    } else if (errorMessage.includes("Failed to connect") || errorMessage.includes("ECONNREFUSED")) {
      userMessage = "Connection refused. Is the server running?";
    }

    throw new Error(userMessage);
  }

  if (response.status === 401) {
    let errorData: ApiErrorResponse | null = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText) as ApiErrorResponse;
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
    let errorData: ApiErrorResponse | null = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText) as ApiErrorResponse;
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

