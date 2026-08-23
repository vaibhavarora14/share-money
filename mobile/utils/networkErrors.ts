export type NetworkErrorMessageInput = {
  apiUrl: string;
  errorName: string;
  errorMessage: string;
  isDevelopment: boolean;
};

export function formatNetworkErrorMessage({
  apiUrl,
  errorName,
  errorMessage,
  isDevelopment,
}: NetworkErrorMessageInput): string {
  const isTimeout =
    errorMessage.includes("timeout") ||
    errorName === "TimeoutError" ||
    errorName === "AbortError";

  if (!isDevelopment) {
    return isTimeout
      ? "Request timed out. Check your connection and try again."
      : "Unable to connect. Check your internet connection and try again.";
  }

  if (
    errorMessage.includes("Network request failed") ||
    errorName === "TypeError"
  ) {
    if (apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1")) {
      return "Cannot connect to server. For Android emulator, use 10.0.2.2 instead of localhost in EXPO_PUBLIC_API_URL";
    }
    if (apiUrl.includes("10.0.0.2")) {
      return "Cannot connect to server. IP address typo detected: use 10.0.2.2 (not 10.0.0.2) for Android emulator in EXPO_PUBLIC_API_URL";
    }
    if (apiUrl.includes("10.0.2.") && !apiUrl.includes("10.0.2.2")) {
      const detectedIp = apiUrl.match(/10\.0\.2\.\d+/)?.[0] || "unknown";
      return `Cannot connect to server. For Android emulator, use exactly 10.0.2.2 (found: ${detectedIp})`;
    }
    return "Cannot connect to server. Please check:\n- Supabase is running (supabase start)\n- Edge Functions server is running (npm run dev:server)\n- Correct API URL in mobile/.env (use 10.0.2.2:54321 for Android emulator)\n- Network connection";
  }

  if (isTimeout) {
    return "Request timed out. The server may be slow or unreachable.";
  }

  if (
    errorMessage.includes("Failed to connect") ||
    errorMessage.includes("ECONNREFUSED")
  ) {
    return "Connection refused. Is the server running?";
  }

  return "Network request failed";
}
