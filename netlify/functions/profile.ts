import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders } from '../utils/cors';
import { verifyAuth, AuthResult } from '../utils/auth';
import { handleError, createErrorResponse } from '../utils/error-handler';
import { validateBodySize } from '../utils/validation';
import { createSuccessResponse, createEmptyResponse } from '../utils/response';

interface Profile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  phone?: string;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Validate request body size
    const bodySizeValidation = validateBodySize(event.body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Verify authentication
    let authResult: AuthResult;
    try {
      authResult = await verifyAuth(event);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabaseUrl, supabaseKey, authHeader } = authResult;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const httpMethod = event.httpMethod;

    // Handle GET /profile - Get current user's profile
    if (httpMethod === 'GET') {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        // If profile doesn't exist, create a default one
        if (error.code === 'PGRST116') {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              profile_completed: false,
            })
            .select()
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

    // Handle PUT /profile - Update current user's profile
    if (httpMethod === 'PUT') {
      if (!event.body) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let updateData: Partial<Profile>;
      try {
        updateData = JSON.parse(event.body);
      } catch (parseError) {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      // Validate required fields for profile completion
      if (updateData.profile_completed === true) {
        if (!updateData.full_name || updateData.full_name.trim().length === 0) {
          return createErrorResponse(400, 'Full name is required to complete profile', 'VALIDATION_ERROR');
        }
      }

      // Only allow updating own profile
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        // If profile doesn't exist, create it
        if (error.code === 'PGRST116') {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              ...updateData,
              profile_completed: updateData.profile_completed || false,
            })
            .select()
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

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error) {
    return handleError(error, 'processing profile request');
  }
};

