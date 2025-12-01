import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { validateBodySize } from '../_shared/validation.ts';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, getOptionalEnv } from '../_shared/env.ts';
import { isValidEmail } from '../_shared/validation.ts';

interface RequestPasswordResetBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/reset-password', '').replace(/^\/+|\/+$/g, '');

    const bodyText = await req.text().catch(() => null);
    const bodyValidation = validateBodySize(bodyText);

    if (!bodyValidation.valid) {
      return createErrorResponse(413, bodyValidation.error || 'Request body too large', 'VALIDATION_ERROR');
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
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let body: RequestPasswordResetBody;
      try {
        body = JSON.parse(bodyText) as RequestPasswordResetBody;
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!body.email) {
        return createErrorResponse(400, 'Email is required', 'VALIDATION_ERROR');
      }

      if (typeof body.email !== 'string') {
        return createErrorResponse(400, 'Email must be a string', 'VALIDATION_ERROR');
      }

      const email = body.email.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return createErrorResponse(400, 'Invalid email format', 'VALIDATION_ERROR');
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
        return createSuccessResponse(
          { message: 'If an account with that email exists, a password reset link has been sent.' },
          200,
          0
        );
      }

      return createSuccessResponse(
        { message: 'If an account with that email exists, a password reset link has been sent.' },
        200,
        0
      );
    }

    // Handle reset password with token
    if (req.method === 'POST' && path === 'confirm') {
      if (!bodyText) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let body: ResetPasswordBody;
      try {
        body = JSON.parse(bodyText) as ResetPasswordBody;
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!body.token) {
        return createErrorResponse(400, 'Token is required', 'VALIDATION_ERROR');
      }

      if (typeof body.token !== 'string') {
        return createErrorResponse(400, 'Token must be a string', 'VALIDATION_ERROR');
      }

      if (!body.password) {
        return createErrorResponse(400, 'Password is required', 'VALIDATION_ERROR');
      }

      const passwordValidation = validatePassword(body.password);
      if (!passwordValidation.valid) {
        return createErrorResponse(400, passwordValidation.error || 'Invalid password', 'VALIDATION_ERROR');
      }

      // The token from Supabase password reset email link is an access_token
      // When user clicks the reset link, Supabase redirects with tokens in the URL hash
      // Format: #access_token=xxx&type=recovery&expires_in=xxx
      // We'll extract the access_token and use it to authenticate
      
      // Parse the token - it might be a full URL hash, query string, or just the token
      let accessToken = body.token;
      
      // If it's a URL with hash parameters, extract the access_token
      if (body.token.includes('#')) {
        const hashParams = new URLSearchParams(body.token.split('#')[1]);
        accessToken = hashParams.get('access_token') || hashParams.get('token') || body.token;
      } else if (body.token.includes('?')) {
        const queryParams = new URLSearchParams(body.token.split('?')[1]);
        accessToken = queryParams.get('access_token') || queryParams.get('token') || body.token;
      }

      // Verify the token by using it to authenticate and get user info
      const tokenClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      // Verify the token is valid by getting the user
      const { data: { user }, error: tokenError } = await tokenClient.auth.getUser();

      if (tokenError || !user) {
        return createErrorResponse(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
      }

      // Token is valid, now update the password
      // Use the authenticated client to update password (requires valid recovery session)
      const { error: updateError } = await tokenClient.auth.updateUser({
        password: body.password,
      });

      if (updateError) {
        // If updateUser fails (e.g., token not a recovery token), fall back to admin API
        if (!SUPABASE_SERVICE_ROLE_KEY) {
          return createErrorResponse(500, 'Service role key not configured', 'CONFIGURATION_ERROR');
        }

        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        // Update password using admin API as fallback
        const { error: adminUpdateError } = await adminClient.auth.admin.updateUserById(
          user.id,
          { password: body.password }
        );

        if (adminUpdateError) {
          return handleError(adminUpdateError, 'resetting password');
        }
      }

      return createSuccessResponse(
        { message: 'Password has been reset successfully' },
        200,
        0
      );
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'reset password handler');
  }
});
