import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.ts';
import { log } from './logger.ts';

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

/**
 * Fetches email for a single user ID using Supabase Admin API
 */
async function fetchUserEmail(
  userId: string,
  currentUserId: string,
  currentUserEmail: string | null
): Promise<string | null> {
  if (userId === currentUserId && currentUserEmail) {
    return currentUserEmail;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  try {
    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
      }
    );
    
    if (userResponse.ok) {
      const userData = await userResponse.json() as UserResponse;
      return userData.user?.email || userData.email || null;
    } else {
      log.warn('Failed to fetch user email', 'user-email', {
        userId,
        status: userResponse.status,
      });
    }
  } catch (err) {
    log.error('Error fetching user email', 'user-email', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  
  return null;
}

/**
 * Batch fetches emails for multiple user IDs
 * Optimized to reduce N+1 query problem by batching requests
 */
export async function fetchUserEmails(
  userIds: string[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  
  if (userIds.length === 0) {
    return emailMap;
  }

  // Add current user email if in the list
  if (currentUserEmail && userIds.includes(currentUserId)) {
    emailMap.set(currentUserId, currentUserEmail);
  }

  // Filter out current user ID since we already have their email
  const userIdsToFetch = userIds.filter(id => id !== currentUserId);
  
  if (userIdsToFetch.length === 0) {
    return emailMap;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    log.warn('SUPABASE_SERVICE_ROLE_KEY not set, skipping email enrichment', 'user-email');
    return emailMap;
  }

  try {
    // Fetch users in parallel batches to optimize performance
    const batchSize = 50; // Process in batches to avoid overwhelming the API
    for (let i = 0; i < userIdsToFetch.length; i += batchSize) {
      const batch = userIdsToFetch.slice(i, i + batchSize);
      
      const emailPromises = batch.map(userId => 
        fetchUserEmail(userId, currentUserId, currentUserEmail)
      );
      
      const emailResults = await Promise.allSettled(emailPromises);
      
      emailResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          emailMap.set(batch[index], result.value);
        }
      });
    }
  } catch (err) {
    log.error('Error in batchFetchUserEmails', 'user-email', {
      error: err instanceof Error ? err.message : String(err),
      userIdCount: userIdsToFetch.length,
    });
  }

  return emailMap;
}
