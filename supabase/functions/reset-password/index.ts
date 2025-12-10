import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, getOptionalEnv } from '../_shared/env.ts';
import { isValidEmail, validateBodySize } from '../_shared/validation.ts';

interface RequestPasswordResetBody {
  email: string;
}

interface ResetPasswordBody {
  token?: string;
  otp?: string;
  email?: string;
  password: string;
}

/**
 * Validates password strength
 * Requirements:
 * - At least 8 characters
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 * - Contains at least one number
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password must be a string' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must be 128 characters or less' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Gets CORS headers, with fallback for local development
 * This function doesn't require ALLOWED_ORIGIN to be set, making it safe for public endpoints
 */
function getCorsHeadersSafe(): Record<string, string> {
  // Try to get ALLOWED_ORIGIN from environment, but don't throw if it's not set
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

/**
 * Creates a successful JSON response with safe CORS handling
 */
function createSuccessResponseSafe(
  data: unknown,
  statusCode: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      ...getCorsHeadersSafe(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

/**
 * Creates an error response with safe CORS handling
 */
function createErrorResponseSafe(
  statusCode: number,
  error: string,
  code?: string,
  details?: string
): Response {
  const errorResponse: { error: string; code?: string; details?: string; timestamp: string } = {
    error,
    timestamp: new Date().toISOString(),
  };

  if (code) {
    errorResponse.code = code;
  }

  if (details) {
    errorResponse.details = details;
  }

  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: {
      ...getCorsHeadersSafe(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        ...getCorsHeadersSafe(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/reset-password', '').replace(/^\/+|\/+$/g, '');

    const bodyText = await req.text().catch(() => null);
    const bodyValidation = validateBodySize(bodyText);

    if (!bodyValidation.valid) {
      return createErrorResponseSafe(413, bodyValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Create Supabase client for public operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // Handle request password reset
    if (req.method === 'POST' && (path === '' || path === '/')) {
      if (!bodyText) {
        return createErrorResponseSafe(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let body: RequestPasswordResetBody;
      try {
        body = JSON.parse(bodyText) as RequestPasswordResetBody;
      } catch {
        return createErrorResponseSafe(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!body.email) {
        return createErrorResponseSafe(400, 'Email is required', 'VALIDATION_ERROR');
      }

      if (typeof body.email !== 'string') {
        return createErrorResponseSafe(400, 'Email must be a string', 'VALIDATION_ERROR');
      }

      const email = body.email.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return createErrorResponseSafe(400, 'Invalid email format', 'VALIDATION_ERROR');
      }

      // Get redirect URL from environment or use default
      const redirectUrl = getOptionalEnv('PASSWORD_RESET_REDIRECT_URL', `${SUPABASE_URL}/reset-password`);

      // Request password reset using Supabase Auth
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        // Don't reveal if email exists or not for security
        // Always return success to prevent email enumeration
        return createSuccessResponseSafe(
          { message: 'If an account with that email exists, a password reset link has been sent.' },
          200
        );
      }

      return createSuccessResponseSafe(
        { message: 'If an account with that email exists, a password reset link has been sent.' },
        200
      );
    }

    // Handle reset password with token or OTP
    if (req.method === 'POST' && path === 'confirm') {
      if (!bodyText) {
        return createErrorResponseSafe(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let body: ResetPasswordBody;
      try {
        body = JSON.parse(bodyText) as ResetPasswordBody;
      } catch {
        return createErrorResponseSafe(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!body.password) {
        return createErrorResponseSafe(400, 'Password is required', 'VALIDATION_ERROR');
      }

      // Must provide either token or OTP
      if (!body.token && !body.otp) {
        return createErrorResponseSafe(400, 'Either token or OTP code is required', 'VALIDATION_ERROR');
      }

      if (body.token && typeof body.token !== 'string') {
        return createErrorResponseSafe(400, 'Token must be a string', 'VALIDATION_ERROR');
      }

      if (body.otp) {
        if (typeof body.otp !== 'string') {
          return createErrorResponseSafe(400, 'OTP must be a string', 'VALIDATION_ERROR');
        }
        if (!body.email) {
          return createErrorResponseSafe(400, 'Email is required when using OTP', 'VALIDATION_ERROR');
        }
        if (typeof body.email !== 'string') {
          return createErrorResponseSafe(400, 'Email must be a string', 'VALIDATION_ERROR');
        }
      }

      const passwordValidation = validatePassword(body.password);
      if (!passwordValidation.valid) {
        return createErrorResponseSafe(400, passwordValidation.error || 'Invalid password', 'VALIDATION_ERROR');
      }

      // Handle OTP code verification
      if (body.otp) {
        const email = body.email!.trim().toLowerCase();
        if (!isValidEmail(email)) {
          return createErrorResponseSafe(400, 'Invalid email format', 'VALIDATION_ERROR');
        }

        // Verify OTP code for password recovery
        const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
          email,
          token: body.otp.trim(),
          type: 'recovery',
        });

        if (otpError || !otpData.session) {
          const errorMsg = otpError?.message || 'Invalid or expired OTP code';
          return createErrorResponseSafe(400, errorMsg, 'INVALID_OTP');
        }

        // OTP verified successfully, now update the password using the session
        const otpClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        // Set the session from OTP verification
        await otpClient.auth.setSession({
          access_token: otpData.session.access_token,
          refresh_token: otpData.session.refresh_token || '',
        });

        // Update password using the verified session
        const { error: updateError } = await otpClient.auth.updateUser({
          password: body.password,
        });

        if (updateError) {
          // If updateUser fails, fall back to admin API
          if (!SUPABASE_SERVICE_ROLE_KEY) {
            return createErrorResponseSafe(500, 'Service role key not configured', 'CONFIGURATION_ERROR');
          }

          const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });

          const { error: adminUpdateError } = await adminClient.auth.admin.updateUserById(
            otpData.session.user.id,
            { password: body.password }
          );

          if (adminUpdateError) {
            const errorMessage = adminUpdateError.message || 'Failed to reset password';
            return createErrorResponseSafe(500, errorMessage, 'PASSWORD_RESET_ERROR');
          }
        }

        return createSuccessResponseSafe(
          { message: 'Password has been reset successfully' },
          200
        );
      }

      // Handle token-based reset (existing flow)
      if (!body.token) {
        return createErrorResponseSafe(400, 'Token is required', 'VALIDATION_ERROR');
      }

      // The token from Supabase password reset email link is an access_token
      // When user clicks the reset link, Supabase redirects with tokens in the URL hash
      // Format: #access_token=xxx&type=recovery&expires_in=xxx
      // Or the full URL: https://...?token=xxx#access_token=xxx&type=recovery
      // We'll extract the access_token and use it to authenticate
      
      // Parse the token - it might be a full URL hash, query string, or just the token
      let accessToken = body.token.trim();
      
      // If it's a URL with hash parameters, extract the access_token
      if (accessToken.includes('#')) {
        const hashPart = accessToken.split('#')[1];
        const hashParams = new URLSearchParams(hashPart);
        accessToken = hashParams.get('access_token') || hashParams.get('token') || accessToken;
      } else if (accessToken.includes('?')) {
        // Check if it's a full URL
        try {
          const url = new URL(accessToken);
          const hash = url.hash.substring(1);
          if (hash) {
            const hashParams = new URLSearchParams(hash);
            accessToken = hashParams.get('access_token') || hashParams.get('token') || accessToken;
          } else {
            // Check query params
            accessToken = url.searchParams.get('access_token') || url.searchParams.get('token') || accessToken;
          }
        } catch {
          // Not a valid URL, try parsing as query string
          const queryParams = new URLSearchParams(accessToken.split('?')[1]);
          accessToken = queryParams.get('access_token') || queryParams.get('token') || accessToken;
        }
      }

      if (!accessToken || accessToken.length < 10) {
        return createErrorResponseSafe(400, 'Invalid token format', 'INVALID_TOKEN');
      }

      // Create a client with the recovery token
      // Recovery tokens from password reset emails need to be used with setSession
      const tokenClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      // Recovery tokens from password reset emails are special - they need to be used
      // with setSession to establish a recovery session, then updateUser can be called
      // Try to set the session with the recovery token
      const { data: sessionData, error: sessionError } = await tokenClient.auth.setSession({
        access_token: accessToken,
        refresh_token: '', // Recovery tokens don't include refresh tokens
      });

      if (sessionError || !sessionData.session) {
        // If setSession fails, the token might be invalid or expired
        // Try to get user info directly to see if we can identify the user
        const { data: { user }, error: userError } = await tokenClient.auth.getUser(accessToken);

        if (userError || !user) {
          // Token is completely invalid - provide helpful error message
          let errorMsg = 'Invalid or expired reset token';
          
          // Provide more specific error messages
          if (sessionError) {
            if (sessionError.message?.includes('expired') || sessionError.message?.includes('invalid')) {
              errorMsg = 'The reset token has expired or is invalid. Please request a new password reset link.';
            } else if (sessionError.message?.includes('JWT')) {
              errorMsg = 'Invalid token format. Please copy the full reset link from your email, or just the access_token value.';
            } else {
              errorMsg = `Token error: ${sessionError.message}`;
            }
          } else if (userError) {
            errorMsg = `Token validation failed: ${userError.message}`;
          }
          
          return createErrorResponseSafe(400, errorMsg, 'INVALID_TOKEN');
        }

        // We got the user, but couldn't set session - use admin API as fallback
        if (!SUPABASE_SERVICE_ROLE_KEY) {
          return createErrorResponseSafe(500, 'Service role key not configured', 'CONFIGURATION_ERROR');
        }

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { error: adminUpdateError } = await adminClient.auth.admin.updateUserById(
          user.id,
          { password: body.password }
        );

        if (adminUpdateError) {
          const errorMessage = adminUpdateError.message || 'Failed to reset password';
          return createErrorResponseSafe(500, errorMessage, 'PASSWORD_RESET_ERROR');
        }
      } else {
        // Session was set successfully - this is the preferred method
        // Now update the password using the recovery session
        const { error: updateError } = await tokenClient.auth.updateUser({
          password: body.password,
        });

        if (updateError) {
          // If updateUser fails, fall back to admin API
          if (!SUPABASE_SERVICE_ROLE_KEY) {
            return createErrorResponseSafe(500, 'Service role key not configured', 'CONFIGURATION_ERROR');
          }

          const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });

          const { error: adminUpdateError } = await adminClient.auth.admin.updateUserById(
            sessionData.session.user.id,
            { password: body.password }
          );

          if (adminUpdateError) {
            const errorMessage = adminUpdateError.message || 'Failed to reset password';
            return createErrorResponseSafe(500, errorMessage, 'PASSWORD_RESET_ERROR');
          }
        }
      }

      return createSuccessResponseSafe(
        { message: 'Password has been reset successfully' },
        200
      );
    }

    return createErrorResponseSafe(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return createErrorResponseSafe(500, errorMessage, 'INTERNAL_ERROR');
  }
});
