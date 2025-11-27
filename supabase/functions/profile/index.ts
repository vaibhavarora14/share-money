import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createSuccessResponse, createEmptyResponse } from '../_shared/response.ts';
import { validateBodySize } from '../_shared/validation.ts';

interface Profile {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

type ProfileUpdates = Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'phone' | 'profile_completed'>>;

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const POSTGREST_NO_ROWS_CODE = 'PGRST116';

function trimOrUndefined(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateProfileUpdates(updates: ProfileUpdates): ValidationResult {
  if (updates.full_name !== undefined && updates.full_name !== null) {
    if (typeof updates.full_name !== 'string') {
      return { valid: false, error: 'Full name must be a string' };
    }

    const trimmedName = updates.full_name.trim();
    if (trimmedName.length === 0) {
      return { valid: false, error: 'Full name cannot be empty' };
    }

    if (trimmedName.length > 255) {
      return { valid: false, error: 'Full name must be 255 characters or less' };
    }
  }

  if (updates.avatar_url !== undefined && updates.avatar_url !== null) {
    if (typeof updates.avatar_url !== 'string') {
      return { valid: false, error: 'Avatar URL must be a string' };
    }

    try {
      // Throws if invalid
      new URL(updates.avatar_url);
    } catch {
      return { valid: false, error: 'Invalid avatar URL format' };
    }
  }

  if (updates.phone !== undefined && updates.phone !== null) {
    if (typeof updates.phone !== 'string') {
      return { valid: false, error: 'Phone number must be a string' };
    }

    const trimmedPhone = updates.phone.trim();
    if (trimmedPhone.length > 20) {
      return { valid: false, error: 'Phone number must be 20 characters or less' };
    }

    const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
    if (trimmedPhone.length > 0 && !phoneRegex.test(trimmedPhone)) {
      return { valid: false, error: 'Invalid phone number format' };
    }
  }

  if (updates.profile_completed !== undefined && typeof updates.profile_completed !== 'boolean') {
    return { valid: false, error: 'profile_completed must be a boolean value' };
  }

  return { valid: true };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    const bodyText = await req.text().catch(() => null);
    const bodyValidation = validateBodySize(bodyText);

    if (!bodyValidation.valid) {
      return createErrorResponse(413, bodyValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabase } = authResult;
    const method = req.method;

    if (method === 'GET') {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.code === POSTGREST_NO_ROWS_CODE) {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              profile_completed: false,
            })
            .select('*')
            .single();

          if (insertError) {
            return handleError(insertError, 'creating profile');
          }

          return createSuccessResponse(newProfile, 200, 0);
        }

        return handleError(error, 'fetching profile');
      }

      return createSuccessResponse(profile, 200, 0);
    }

    if (method === 'PUT') {
      if (!bodyText) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let updates: ProfileUpdates;
      try {
        updates = JSON.parse(bodyText) as ProfileUpdates;
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      const validation = validateProfileUpdates(updates);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid profile data', 'VALIDATION_ERROR');
      }

      if (updates.profile_completed === true) {
        const fullName = trimOrUndefined(updates.full_name);
        if (!fullName) {
          return createErrorResponse(400, 'Full name is required to complete profile', 'VALIDATION_ERROR');
        }
      }

      const sanitizedUpdates: ProfileUpdates & { updated_at: string } = {
        updated_at: new Date().toISOString(),
      };

      if (updates.full_name !== undefined) {
        sanitizedUpdates.full_name = trimOrUndefined(updates.full_name) ?? null;
      }

      if (updates.avatar_url !== undefined) {
        sanitizedUpdates.avatar_url = updates.avatar_url;
      }

      if (updates.phone !== undefined) {
        const trimmedPhone = trimOrUndefined(updates.phone);
        sanitizedUpdates.phone = trimmedPhone ?? null;
      }

      if (updates.profile_completed !== undefined) {
        sanitizedUpdates.profile_completed = updates.profile_completed;
      }

      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update(sanitizedUpdates)
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) {
        if (error.code === POSTGREST_NO_ROWS_CODE) {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              full_name: sanitizedUpdates.full_name ?? null,
              avatar_url: sanitizedUpdates.avatar_url ?? null,
              phone: sanitizedUpdates.phone ?? null,
              profile_completed: sanitizedUpdates.profile_completed ?? false,
            })
            .select('*')
            .single();

          if (insertError) {
            return handleError(insertError, 'creating profile');
          }

          return createSuccessResponse(newProfile, 201, 0);
        }

        return handleError(error, 'updating profile');
      }

      return createSuccessResponse(updatedProfile, 200, 0);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'profile handler');
  }
});
