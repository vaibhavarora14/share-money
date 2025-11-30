import { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger.ts';

/**
 * Fetches profile data (full_name, avatar_url) for multiple user IDs
 * Returns a map of user_id -> { full_name, avatar_url }
 */
export async function fetchUserProfiles(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { full_name: string | null; avatar_url: string | null }>> {
  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  
  if (userIds.length === 0) {
    return profileMap;
  }

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);

    if (error) {
      log.error('Error fetching user profiles', 'user-profiles', {
        error: error.message,
        userIdCount: userIds.length,
      });
      return profileMap;
    }

    (profiles || []).forEach(profile => {
      profileMap.set(profile.id, {
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      });
    });
  } catch (err) {
    log.error('Error in fetchUserProfiles', 'user-profiles', {
      error: err instanceof Error ? err.message : String(err),
      userIdCount: userIds.length,
    });
  }

  return profileMap;
}

