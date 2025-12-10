const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: string;
}

/**
 * Requests a password reset email to be sent
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!API_URL) {
    throw new Error(
      "Unable to connect to the server. Please check your app configuration and try again."
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase configuration is missing. Please check your app configuration."
    );
  }

  const response = await fetch(`${API_URL}/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
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

    const errorMessage =
      errorData?.error ||
      errorData?.message ||
      errorData?.details ||
      `HTTP error! status: ${response.status}`;

    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data;
}

/**
 * Confirms password reset with either a token or OTP code
 * @param tokenOrOtp - Either a reset token/URL or a 6-digit OTP code
 * @param password - New password to set
 * @param email - Required when using OTP code, optional for token
 */
export async function confirmPasswordReset(
  tokenOrOtp: string,
  password: string,
  email?: string
): Promise<void> {
  if (!API_URL) {
    throw new Error(
      "Unable to connect to the server. Please check your app configuration and try again."
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase configuration is missing. Please check your app configuration."
    );
  }

  // Determine if it's an OTP (6 digits) or a token (longer, starts with eyJ or is a URL)
  const isOTP = /^\d{6}$/.test(tokenOrOtp.trim());
  
  if (isOTP && !email) {
    throw new Error("Email is required when using OTP code");
  }
  
  const requestBody = isOTP
    ? { otp: tokenOrOtp.trim(), password, email: email!.trim().toLowerCase() }
    : { token: tokenOrOtp.trim(), password };

  const response = await fetch(`${API_URL}/reset-password/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
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

    const errorMessage =
      errorData?.error ||
      errorData?.message ||
      errorData?.details ||
      `HTTP error! status: ${response.status}`;

    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data;
}
