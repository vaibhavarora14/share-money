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

  // Filter out non-UUID values (emails, etc.) - only process valid UUIDs
  // UUID pattern: 8-4-4-4-12 hexadecimal characters
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validUserIds = userIds.filter(id => uuidPattern.test(id));

  if (validUserIds.length === 0) {
    return profileMap;
  }

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', validUserIds);

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

