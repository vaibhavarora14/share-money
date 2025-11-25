import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { AuthResult, verifyAuth } from '../utils/auth';
import { createErrorResponse, handleError } from '../utils/error-handler';
import { createEmptyResponse, createSuccessResponse } from '../utils/response';
import { isValidUUID } from '../utils/validation';
import { ACTIVITY_FEED_CONFIG } from './constants';
import { generateActivityDescription } from './activityDescriptions';

// Export types for use in activityDescriptions.ts
export type { TransactionHistory, TransactionSnapshot, SettlementSnapshot, ChangesDiff, HistoryChanges, HistorySnapshot };

/**
 * Transaction snapshot structure
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

/**
 * Settlement snapshot structure
 */
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

/**
 * Changes diff structure for updates
 */
interface ChangesDiff {
  [field: string]: {
    old: unknown;
    new: unknown;
  };
}

/**
 * Changes structure stored in history
 */
interface HistoryChanges {
  action: 'created' | 'updated' | 'deleted';
  diff?: ChangesDiff;
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
  transaction_id?: number;
  settlement_id?: string;
}

/**
 * Snapshot structure stored in history
 */
interface HistorySnapshot {
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
}

interface TransactionHistory {
  id: string;
  transaction_id: number | null; // Nullable for deleted transactions
  settlement_id: string | null; // Nullable for settlements
  activity_type: 'transaction' | 'settlement';
  group_id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_by: string;
  changed_at: string;
  changes: HistoryChanges;
  snapshot: HistorySnapshot | null;
}

/**
 * Activity item details structure
 */
interface ActivityItemDetails {
  action: 'created' | 'updated' | 'deleted';
  changes?: ChangesDiff;
  transaction?: TransactionSnapshot;
  settlement?: SettlementSnapshot;
}

/**
 * Activity item returned to frontend
 */
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

/**
 * Fetches email for a single user ID
 * @param userId - The user ID to fetch email for
 * @param supabaseUrl - Supabase project URL
 * @param serviceRoleKey - Service role key for admin API access
 * @param currentUserId - Current authenticated user ID
 * @param currentUserEmail - Current authenticated user email
 * @returns User email or null if not found
 */
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
    // Continue - email enrichment is optional
  }
  return null;
}

/**
 * Batch fetches emails for multiple user IDs using Supabase Admin API
 * @param userIds - Array of user IDs to fetch emails for
 * @param supabaseUrl - Supabase project URL
 * @param serviceRoleKey - Service role key for admin API access
 * @param currentUserId - Current authenticated user ID
 * @param currentUserEmail - Current authenticated user email
 * @returns Map of user ID to email address
 */
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

  // Add current user email if in the list
  if (currentUserEmail && userIds.includes(currentUserId)) {
    emailMap.set(currentUserId, currentUserEmail);
  }

  // Filter out current user ID since we already have their email
  const userIdsToFetch = userIds.filter(id => id !== currentUserId);
  
  if (userIdsToFetch.length === 0) {
    return emailMap;
  }

  try {
    // Fetch users in parallel batches
    // Note: Supabase Admin API doesn't support filtering by user IDs, so we use parallel individual fetches
    // Using Promise.allSettled for parallel execution with error tolerance
    const batchSize = 50; // Smaller batches to avoid overwhelming the API
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
    // Fallback: try fetching all at once
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

/**
 * Collects all user IDs from history records that need email enrichment
 * @param historyRecords - Array of transaction history records
 * @returns Set of user IDs that need email lookup
 */
function collectUserIdsFromHistory(historyRecords: TransactionHistory[]): Set<string> {
  const userIds = new Set<string>();
  
  historyRecords.forEach((h: TransactionHistory) => {
    // Collect user IDs from changed_by
    userIds.add(h.changed_by);
    
    // Collect user IDs from split changes
    if (h.action === 'updated' && h.changes?.diff?.split_among) {
      const splitDiff = h.changes.diff.split_among;
      const oldSplits = Array.isArray(splitDiff.old) ? splitDiff.old : [];
      const newSplits = Array.isArray(splitDiff.new) ? splitDiff.new : [];
      oldSplits.forEach((userId: string) => userIds.add(userId));
      newSplits.forEach((userId: string) => userIds.add(userId));
    }
    
    // Collect user IDs from settlements (from_user_id and to_user_id)
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

/**
 * Enriches activity items with email addresses for changed_by users and split users
 * @param supabaseUrl - Supabase project URL
 * @param serviceRoleKey - Service role key for admin API access
 * @param historyRecords - Raw history records from database
 * @param activities - Transformed activity items
 * @param currentUserId - Current authenticated user ID
 * @param currentUserEmail - Current authenticated user email
 * @returns Map of user ID to email address
 */
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

  // Collect all user IDs that need email lookup
  const userIds = collectUserIdsFromHistory(historyRecords);
  const userIdsArray = Array.from(userIds);
  
  if (userIdsArray.length === 0) {
    return emailMap;
  }

  // Batch fetch emails using optimized API
  const fetchedEmailMap = await batchFetchUserEmails(
    userIdsArray,
    supabaseUrl,
    serviceRoleKey,
    currentUserId,
    currentUserEmail
  );

  // Merge fetched emails into main map
  fetchedEmailMap.forEach((email, userId) => {
    emailMap.set(userId, email);
  });

  // Add emails to activities' changed_by
  activities.forEach(a => {
    const email = emailMap.get(a.changed_by.id);
    if (email) {
      a.changed_by.email = email;
    } else {
      // Fallback to user-friendly message if email not found
      a.changed_by.email = 'Unknown User';
    }
  });
  
  return emailMap;
}

// Description generation moved to activityDescriptions.ts

/**
 * Transforms database history record to ActivityItem
 * @param history - Transaction history record from database
 * @param currencyMap - Map of transaction/settlement IDs to currency codes (from actual records)
 * @param emailMap - Map of user IDs to email addresses for name resolution
 * @returns ActivityItem for frontend consumption
 */
function transformHistoryToActivity(
  history: TransactionHistory,
  currencyMap?: Map<string | number, string>,
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
    // For settlements, prioritize snapshot, then changes
    // Also enrich currency from actual settlement record if available
    let settlement: SettlementSnapshot | undefined = undefined;
    
    if (history.snapshot?.settlement) {
      settlement = history.snapshot.settlement as SettlementSnapshot;
    } else if (history.changes?.settlement) {
      settlement = history.changes.settlement as SettlementSnapshot;
    }
    
    // Enrich currency: prioritize snapshot (historical accuracy), then fallback to current record
    if (settlement && history.settlement_id) {
      // First, try to get currency from snapshot (preserves historical state)
      let currency = settlement.currency;
      
      // If snapshot doesn't have currency, try changes.settlement
      if (!currency || currency === null || currency === '') {
        const changesSettlement = history.changes?.settlement as SettlementSnapshot | undefined;
        if (changesSettlement?.currency) {
          currency = changesSettlement.currency;
        }
      }
      
      // Only fallback to current record if snapshot/changes don't have it
      // This ensures historical accuracy - if currency was changed later, old activities still show old currency
      if (!currency || currency === null || currency === '') {
        const currentCurrency = currencyMap?.get(history.settlement_id);
        if (currentCurrency) {
          currency = currentCurrency;
        } else {
          // Last resort: default to USD
          currency = 'USD';
        }
      }
      
      settlement.currency = currency.toUpperCase();
    }
    
    if (settlement) {
      details.settlement = settlement;
    }
  } else {
    // For transactions, prioritize snapshot, then changes
    // Also enrich currency from actual transaction record if available
    let transaction: TransactionSnapshot | undefined = undefined;
    
    if (history.snapshot?.transaction) {
      transaction = history.snapshot.transaction as TransactionSnapshot;
    } else if (history.changes?.transaction) {
      transaction = history.changes.transaction as TransactionSnapshot;
    }
    
    // Enrich currency: prioritize snapshot (historical accuracy), then fallback to current record
    if (transaction && history.transaction_id) {
      // First, try to get currency from snapshot (preserves historical state)
      let currency = transaction.currency;
      
      // If snapshot doesn't have currency, try changes.transaction
      if (!currency || currency === null || currency === '') {
        const changesTransaction = history.changes?.transaction as TransactionSnapshot | undefined;
        if (changesTransaction?.currency) {
          currency = changesTransaction.currency;
        }
      }
      
      // Only fallback to current record if snapshot/changes don't have it
      // This ensures historical accuracy - if currency was changed later, old activities still show old currency
      if (!currency || currency === null || currency === '') {
        const currentCurrency = currencyMap?.get(history.transaction_id);
        if (currentCurrency) {
          currency = currentCurrency;
        } else {
          // Last resort: default to USD
          currency = 'USD';
        }
      }
      
      transaction.currency = currency.toUpperCase();
    }
    
    if (transaction) {
      details.transaction = transaction;
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
      email: '', // Will be populated by enrichActivitiesWithEmails
    },
    changed_at: history.changed_at,
    description: generateActivityDescription(history, emailMap),
    details,
  };
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Only support GET
    if (event.httpMethod !== 'GET') {
      return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }

    // Verify authentication
    let authResult: AuthResult;
    try {
      authResult = await verifyAuth(event);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabaseUrl, supabaseKey, authHeader } = authResult;

    // Get group_id from query parameters
    const groupId = event.queryStringParameters?.group_id;
    
    if (!groupId) {
      return createErrorResponse(400, 'Missing required parameter: group_id', 'VALIDATION_ERROR');
    }

    if (!isValidUUID(groupId)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
    }

    // Verify user is a member of the group
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

    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return createErrorResponse(403, 'You must be a member of the group to view activity', 'PERMISSION_DENIED');
    }

    // Get pagination parameters
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || String(ACTIVITY_FEED_CONFIG.DEFAULT_LIMIT)), 
      ACTIVITY_FEED_CONFIG.MAX_LIMIT
    );
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    // Fetch transaction and settlement history for this group
    const { data: historyRecords, error: historyError } = await supabase
      .from('transaction_history')
      .select('*')
      .eq('group_id', groupId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      return handleError(historyError, 'fetching transaction history');
    }

    // Fetch currency from actual transaction/settlement records for enrichment
    // This is more reliable than reading from JSONB snapshots
    const transactionIds = (historyRecords || [])
      .filter((h: TransactionHistory) => h.transaction_id !== null)
      .map((h: TransactionHistory) => h.transaction_id) as number[];
    
    const settlementIds = (historyRecords || [])
      .filter((h: TransactionHistory) => h.settlement_id !== null)
      .map((h: TransactionHistory) => h.settlement_id) as string[];

    // Fetch transactions with currency
    const currencyMap = new Map<string | number, string>();
    
    if (transactionIds.length > 0) {
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id, currency')
        .in('id', transactionIds);
      
      if (!txError && transactions) {
        transactions.forEach((tx: { id: number; currency: string }) => {
          if (tx.currency) {
            currencyMap.set(tx.id, tx.currency.toUpperCase());
          }
        });
      }
    }

    // Fetch settlements with currency
    if (settlementIds.length > 0) {
      const { data: settlements, error: stError } = await supabase
        .from('settlements')
        .select('id, currency')
        .in('id', settlementIds);
      
      if (!stError && settlements) {
        settlements.forEach((st: { id: string; currency: string }) => {
          if (st.currency) {
            currencyMap.set(st.id, st.currency.toUpperCase());
          }
        });
      }
    }

    // Transform history records to activity items (before email enrichment)
    // Pass currencyMap to enrich snapshots with currency from actual records
    const activities: ActivityItem[] = (historyRecords || []).map((h: TransactionHistory) => 
      transformHistoryToActivity(h, currencyMap)
    );

    // Enrich activities with email addresses
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const emailMap = await enrichActivitiesWithEmails(
      supabaseUrl,
      serviceRoleKey,
      historyRecords || [],
      activities,
      user.id,
      user.email || null
    );

    // Get total count for pagination (with same filters as main query)
    const countQuery = supabase
      .from('transaction_history')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);
    
    const { count, error: countError } = await countQuery;

    // Handle count query error gracefully
    let total: number;
    let hasMore: boolean;
    
    if (countError) {
      console.error('Count query error:', countError);
      // Fallback: use activities.length as estimate
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
    }, 200, 0); // No caching - real-time data
  } catch (error: unknown) {
    return handleError(error, 'activity handler');
  }
};
