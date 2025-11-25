import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createSuccessResponse, createEmptyResponse } from '../_shared/response.ts';
import { isValidUUID } from '../_shared/validation.ts';
import { ACTIVITY_FEED_CONFIG } from '../_shared/constants.ts';
import { generateActivityDescription } from '../_shared/activityDescriptions.ts';

interface TransactionSnapshot {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: string;
  category?: string;
  currency: string;
  user_id: string;
  group_id: string;
  paid_by: string;
  split_among?: string[];
  created_at: string;
  updated_at?: string;
}

interface SettlementSnapshot {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

interface ChangesDiff {
  [field: string]: {
    old: unknown;
    new: unknown;
  };
}

interface HistoryChanges {
  action: 'created' | 'updated' | 'deleted';
  diff?: ChangesDiff;
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
  transaction_id?: number;
  settlement_id?: string;
}

interface HistorySnapshot {
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
}

interface TransactionHistory {
  id: string;
  transaction_id: number | null;
  settlement_id: string | null;
  activity_type: 'transaction' | 'settlement';
  group_id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_by: string;
  changed_at: string;
  changes: HistoryChanges;
  snapshot: HistorySnapshot | null;
}

interface ActivityItemDetails {
  action: 'created' | 'updated' | 'deleted';
  changes?: ChangesDiff;
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
}

interface ActivityItem {
  id: string;
  type: 'transaction_created' | 'transaction_updated' | 'transaction_deleted' | 'settlement_created' | 'settlement_updated' | 'settlement_deleted';
  transaction_id?: number;
  settlement_id?: string;
  group_id: string;
  changed_by: {
    id: string;
    email: string;
  };
  changed_at: string;
  description: string;
  details: ActivityItemDetails;
}

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

async function fetchUserEmail(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  currentUserId: string,
  currentUserEmail: string | null
): Promise<string | null> {
  if (userId === currentUserId && currentUserEmail) {
    return currentUserEmail;
  }

  try {
    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
        },
      }
    );
    
    if (userResponse.ok) {
      const userData = await userResponse.json() as UserResponse;
      return userData.user?.email || userData.email || null;
    } else {
      console.error(`Failed to fetch email for user ${userId}: HTTP ${userResponse.status}`);
    }
  } catch (err) {
    console.error(`Error fetching email for user ${userId}:`, err instanceof Error ? err.message : String(err));
  }
  return null;
}

async function batchFetchUserEmails(
  userIds: string[],
  supabaseUrl: string,
  serviceRoleKey: string,
  currentUserId: string,
  currentUserEmail: string | null
): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  
  if (userIds.length === 0) {
    return emailMap;
  }

  if (currentUserEmail && userIds.includes(currentUserId)) {
    emailMap.set(currentUserId, currentUserEmail);
  }

  const userIdsToFetch = userIds.filter(id => id !== currentUserId);
  
  if (userIdsToFetch.length === 0) {
    return emailMap;
  }

  try {
    const batchSize = 50;
    for (let i = 0; i < userIdsToFetch.length; i += batchSize) {
      const batch = userIdsToFetch.slice(i, i + batchSize);
      
      const individualPromises = batch.map(userId => 
        fetchUserEmail(userId, supabaseUrl, serviceRoleKey, currentUserId, currentUserEmail)
      );
      
      const individualResults = await Promise.allSettled(individualPromises);
      
      individualResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          emailMap.set(batch[index], result.value);
        }
      });
    }
  } catch (err) {
    console.error('Error in batchFetchUserEmails:', err instanceof Error ? err.message : String(err));
    const individualPromises = userIdsToFetch.map(userId => 
      fetchUserEmail(userId, supabaseUrl, serviceRoleKey, currentUserId, currentUserEmail)
    );
    const individualResults = await Promise.allSettled(individualPromises);
    
    individualResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        emailMap.set(userIdsToFetch[index], result.value);
      }
    });
  }

  return emailMap;
}

function collectUserIdsFromHistory(historyRecords: TransactionHistory[]): Set<string> {
  const userIds = new Set<string>();
  
  historyRecords.forEach((h: TransactionHistory) => {
    userIds.add(h.changed_by);
    
    if (h.action === 'updated' && h.changes?.diff?.split_among) {
      const splitDiff = h.changes.diff.split_among;
      const oldSplits = Array.isArray(splitDiff.old) ? splitDiff.old : [];
      const newSplits = Array.isArray(splitDiff.new) ? splitDiff.new : [];
      oldSplits.forEach((userId: string) => userIds.add(userId));
      newSplits.forEach((userId: string) => userIds.add(userId));
    }
    
    if (h.activity_type === 'settlement') {
      const settlement = h.snapshot?.settlement || h.changes?.settlement;
      if (settlement) {
        if (settlement.from_user_id) userIds.add(settlement.from_user_id);
        if (settlement.to_user_id) userIds.add(settlement.to_user_id);
      }
    }
  });
  
  return userIds;
}

async function enrichActivitiesWithEmails(
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  historyRecords: TransactionHistory[],
  activities: ActivityItem[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  
  if (!serviceRoleKey || historyRecords.length === 0) {
    return emailMap;
  }

  const userIds = collectUserIdsFromHistory(historyRecords);
  const userIdsArray = Array.from(userIds);
  
  if (userIdsArray.length === 0) {
    return emailMap;
  }

  const fetchedEmailMap = await batchFetchUserEmails(
    userIdsArray,
    supabaseUrl,
    serviceRoleKey,
    currentUserId,
    currentUserEmail
  );

  fetchedEmailMap.forEach((email, userId) => {
    emailMap.set(userId, email);
  });

  activities.forEach(a => {
    const email = emailMap.get(a.changed_by.id);
    if (email) {
      a.changed_by.email = email;
    } else {
      a.changed_by.email = 'Unknown User';
    }
  });
  
  return emailMap;
}

function transformHistoryToActivity(
  history: TransactionHistory,
  emailMap?: Map<string, string>
): ActivityItem {
  const activityType = history.activity_type || 'transaction';
  
  const typeMap: Record<string, ActivityItem['type']> = {
    'created': activityType === 'settlement' ? 'settlement_created' : 'transaction_created',
    'updated': activityType === 'settlement' ? 'settlement_updated' : 'transaction_updated',
    'deleted': activityType === 'settlement' ? 'settlement_deleted' : 'transaction_deleted',
  };

  const details: ActivityItemDetails = {
    action: history.action,
  };

  if (history.action === 'updated' && history.changes?.diff) {
    details.changes = history.changes.diff;
  }

  if (activityType === 'settlement') {
    if (history.snapshot?.settlement) {
      details.settlement = history.snapshot.settlement;
    } else if (history.changes?.settlement) {
      details.settlement = history.changes.settlement;
    }
  } else {
    if (history.snapshot?.transaction) {
      details.transaction = history.snapshot.transaction;
    } else if (history.changes?.transaction) {
      details.transaction = history.changes.transaction;
    }
  }

  return {
    id: history.id,
    type: typeMap[history.action] || 'transaction_updated',
    transaction_id: history.transaction_id || undefined,
    settlement_id: history.settlement_id || undefined,
    group_id: history.group_id,
    changed_by: {
      id: history.changed_by,
      email: '',
    },
    changed_at: history.changed_at,
    description: generateActivityDescription(history, emailMap),
    details,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    if (req.method !== 'GET') {
      return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabase } = authResult;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id');
    
    if (!groupId) {
      return createErrorResponse(400, 'Missing required parameter: group_id', 'VALIDATION_ERROR');
    }

    if (!isValidUUID(groupId)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
    }

    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return createErrorResponse(403, 'You must be a member of the group to view activity', 'PERMISSION_DENIED');
    }

    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || String(ACTIVITY_FEED_CONFIG.DEFAULT_LIMIT)), 
      ACTIVITY_FEED_CONFIG.MAX_LIMIT
    );
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const { data: historyRecords, error: historyError } = await supabase
      .from('transaction_history')
      .select('*')
      .eq('group_id', groupId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      return handleError(historyError, 'fetching transaction history');
    }

    const activities: ActivityItem[] = (historyRecords || []).map((h: TransactionHistory) => 
      transformHistoryToActivity(h)
    );

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const emailMap = await enrichActivitiesWithEmails(
      supabaseUrl,
      serviceRoleKey,
      historyRecords || [],
      activities,
      user.id,
      user.email || null
    );

    const countQuery = supabase
      .from('transaction_history')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);
    
    const { count, error: countError } = await countQuery;

    let total: number;
    let hasMore: boolean;
    
    if (countError) {
      console.error('Count query error:', countError);
      total = activities.length;
      hasMore = activities.length >= limit;
    } else {
      total = count || 0;
      hasMore = offset + activities.length < total;
    }

    return createSuccessResponse({
      activities,
      total,
      has_more: hasMore,
    }, 200, 0);
  } catch (error: unknown) {
    return handleError(error, 'activity handler');
  }
});
