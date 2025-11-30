import { generateActivityDescription } from '../_shared/activityDescriptions.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { ACTIVITY_FEED_CONFIG } from '../_shared/constants.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { fetchUserProfiles } from '../_shared/user-profiles.ts';
import { isValidUUID } from '../_shared/validation.ts';

/**
 * Activity Edge Function
 * 
 * Returns activity feed for a group showing transaction and settlement history:
 * - GET /activity?group_id=xxx&limit=50&offset=0 - Get activity feed with pagination
 * 
 * Activity items include created/updated/deleted transactions and settlements.
 * 
 * @route /functions/v1/activity
 * @requires Authentication
 */

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

// Email fetching now handled by shared utility

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

async function buildEmailMapForHistory(
  historyRecords: TransactionHistory[],
  currentUserId: string,
  currentUserEmail: string | null,
  supabase: any
): Promise<{ emailMap: Map<string, string>; profileMap: Map<string, { full_name: string | null; avatar_url: string | null }> }> {
  const emailMap = new Map<string, string>();
  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  
  if (historyRecords.length === 0) {
    return { emailMap, profileMap };
  }

  const userIds = collectUserIdsFromHistory(historyRecords);
  const userIdsArray = Array.from(userIds);
  
  if (userIdsArray.length === 0) {
    return { emailMap, profileMap };
  }

  const [fetchedEmailMap, fetchedProfileMap] = await Promise.all([
    fetchUserEmails(userIdsArray, currentUserId, currentUserEmail),
    fetchUserProfiles(supabase, userIdsArray),
  ]);

  fetchedEmailMap.forEach((email, userId) => {
    emailMap.set(userId, email);
  });
  
  fetchedProfileMap.forEach((profile, userId) => {
    profileMap.set(userId, profile);
  });
  
  return { emailMap, profileMap };
}

function extractSnapshot(
  history: TransactionHistory
): { transaction?: TransactionSnapshot; settlement?: SettlementSnapshot } {
  const snapshot = history.snapshot;
  if (!snapshot) {
    return {};
  }

  if (history.activity_type === 'settlement') {
    if ((snapshot as any).settlement) {
      return { settlement: (snapshot as any).settlement as SettlementSnapshot };
    }
    if ('from_user_id' in snapshot && 'to_user_id' in snapshot) {
      return { settlement: snapshot as unknown as SettlementSnapshot };
    }
    return {};
  }

  if ((snapshot as any).transaction) {
    return { transaction: (snapshot as any).transaction as TransactionSnapshot };
  }

  if ('amount' in snapshot && 'currency' in snapshot && 'group_id' in snapshot) {
    return { transaction: snapshot as unknown as TransactionSnapshot };
  }

  return {};
}

function transformHistoryToActivity(
  history: TransactionHistory,
  emailMap?: Map<string, string>,
  profileMap?: Map<string, { full_name: string | null; avatar_url: string | null }>
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

  const snapshot = extractSnapshot(history);

  if (activityType === 'settlement') {
    if (snapshot.settlement) {
      details.settlement = snapshot.settlement;
    } else if (history.changes?.settlement) {
      details.settlement = history.changes.settlement;
    }
  } else {
    if (snapshot.transaction) {
      details.transaction = snapshot.transaction;
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
      email: emailMap?.get(history.changed_by) || 'Unknown User',
      full_name: profileMap?.get(history.changed_by)?.full_name || null,
      avatar_url: profileMap?.get(history.changed_by)?.avatar_url || null,
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
      .select('id, transaction_id, settlement_id, activity_type, group_id, action, changed_by, changed_at, changes, snapshot')
      .eq('group_id', groupId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      return handleError(historyError, 'fetching transaction history');
    }

    const { emailMap, profileMap } = await buildEmailMapForHistory(
      historyRecords || [],
      user.id,
      user.email || null,
      supabase
    );

    const activities: ActivityItem[] = (historyRecords || []).map((h: TransactionHistory) => 
      transformHistoryToActivity(h, emailMap, profileMap)
    );

    const countQuery = supabase
      .from('transaction_history')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId);
    
    const { count, error: countError } = await countQuery;

    let total: number;
    let hasMore: boolean;
    
    if (countError) {
      log.error('Count query error', 'activity-feed', {
        error: countError.message,
        code: countError.code,
        groupId,
      });
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
