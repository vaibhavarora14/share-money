import { Handler } from '@netlify/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthResult, verifyAuth } from '../utils/auth';
import { createErrorResponse, handleError } from '../utils/error-handler';
import { createEmptyResponse, createSuccessResponse } from '../utils/response';
import { isValidUUID } from '../utils/validation';

interface TransactionHistory {
  id: string;
  transaction_id: number | null; // Nullable for deleted transactions
  group_id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_by: string;
  changed_at: string;
  changes: any;
  snapshot: any;
}

interface ActivityItem {
  id: string;
  type: 'transaction_created' | 'transaction_updated' | 'transaction_deleted';
  transaction_id?: number;
  group_id: string;
  changed_by: {
    id: string;
    email: string;
  };
  changed_at: string;
  description: string;
  details: {
    action: 'created' | 'updated' | 'deleted';
    changes?: {
      [field: string]: {
        old: any;
        new: any;
      };
    };
    transaction?: any;
  };
}

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

/**
 * Enriches activity items with email addresses for changed_by users
 */
async function enrichActivitiesWithEmails(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  activities: ActivityItem[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<void> {
  if (!serviceRoleKey || activities.length === 0) {
    return;
  }

  const userIds = new Set<string>();
  activities.forEach(a => {
    userIds.add(a.changed_by.id);
  });

  const userIdsArray = Array.from(userIds);
  
  // Fetch emails in parallel
  const emailPromises = userIdsArray.map(async (userId): Promise<{ userId: string; email: string | null }> => {
    if (userId === currentUserId && currentUserEmail) {
      return { userId, email: currentUserEmail };
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
        const email = userData.user?.email || userData.email || null;
        return { userId, email };
      }
    } catch (err) {
      // Log error but continue - email enrichment is optional
    }
    return { userId, email: null };
  });

  const emailResults = await Promise.allSettled(emailPromises);
  const emailMap = new Map<string, string>();
  
  for (const result of emailResults) {
    if (result.status === 'fulfilled' && result.value.email) {
      emailMap.set(result.value.userId, result.value.email);
    }
  }

  // Add emails to activities
  activities.forEach(a => {
    const email = emailMap.get(a.changed_by.id);
    if (email) {
      a.changed_by.email = email;
    } else {
      // Fallback to user ID if email not found
      a.changed_by.email = a.changed_by.id.substring(0, 8) + '...';
    }
  });
}

/**
 * Generates human-readable description for an activity item
 */
function generateActivityDescription(history: TransactionHistory): string {
  const action = history.action;
  const changes = history.changes;
  const snapshot = history.snapshot;

  switch (action) {
    case 'created': {
      const transaction = snapshot || changes?.transaction;
      if (transaction) {
        const amount = transaction.amount || 0;
        const description = transaction.description || 'transaction';
        // Show description glimpse (first 30 chars) + amount
        const descriptionGlimpse = description.length > 30 
          ? description.substring(0, 30) + '...' 
          : description;
        return `${formatCurrency(amount)} - ${descriptionGlimpse}`;
      }
      return 'Added transaction';
    }

    case 'updated': {
      const diff = changes?.diff || {};
      const fields = Object.keys(diff);
      
      if (fields.length === 0) {
        return 'Updated transaction';
      }

      // Get transaction description for context (from snapshot or changes)
      const transaction = snapshot?.transaction || changes?.transaction;
      const descriptionGlimpse = transaction?.description 
        ? (transaction.description.length > 25 
            ? transaction.description.substring(0, 25) + '...' 
            : transaction.description)
        : null;

      // Build list of changed fields
      const fieldChanges: string[] = [];
      
      fields.forEach(field => {
        const { old: oldVal, new: newVal } = diff[field];
        
        // Format field name for display
        const fieldDisplayName = formatFieldName(field);
        
        if (field === 'split_among') {
          // Special handling for splits
          const oldCount = Array.isArray(oldVal) ? oldVal.length : 0;
          const newCount = Array.isArray(newVal) ? newVal.length : 0;
          if (oldCount !== newCount) {
            if (newCount > oldCount) {
              fieldChanges.push(`splits: added ${newCount - oldCount} person(s)`);
            } else {
              fieldChanges.push(`splits: removed ${oldCount - newCount} person(s)`);
            }
          } else {
            fieldChanges.push(`splits: changed`);
          }
        } else {
          fieldChanges.push(`${fieldDisplayName}: ${formatValue(field, oldVal)} → ${formatValue(field, newVal)}`);
        }
      });

      // Combine description glimpse with changes
      if (descriptionGlimpse) {
        return `${descriptionGlimpse} - ${fieldChanges.join(', ')}`;
      } else {
        return fieldChanges.join(', ');
      }
    }

    case 'deleted': {
      const transaction = snapshot || changes?.transaction;
      if (transaction) {
        const amount = transaction.amount || 0;
        const description = transaction.description || 'transaction';
        // Show description glimpse (first 30 chars) + amount
        const descriptionGlimpse = description.length > 30 
          ? description.substring(0, 30) + '...' 
          : description;
        return `Deleted: ${formatCurrency(amount)} - ${descriptionGlimpse}`;
      }
      return 'Deleted transaction';
    }

    default:
      return 'Transaction activity';
  }
}

/**
 * Formats field names for display
 */
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    'amount': 'amount',
    'description': 'description',
    'date': 'date',
    'category': 'category',
    'type': 'type',
    'paid_by': 'paid by',
    'split_among': 'splits',
    'currency': 'currency',
  };
  return fieldMap[field] || field;
}

/**
 * Formats a value for display based on field type
 */
function formatValue(field: string, value: any): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  
  if (field === 'amount') {
    return formatCurrency(value);
  }
  
  if (field === 'date') {
    try {
      return new Date(value).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric' 
      });
    } catch {
      return String(value);
    }
  }
  
  if (field === 'split_among' && Array.isArray(value)) {
    return `${value.length} person(s)`;
  }
  
  if (Array.isArray(value)) {
    return `${value.length} item(s)`;
  }
  
  // Truncate long strings
  const str = String(value);
  if (str.length > 20) {
    return str.substring(0, 20) + '...';
  }
  
  return str;
}

/**
 * Formats currency amount
 */
function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

/**
 * Transforms database history record to ActivityItem
 */
function transformHistoryToActivity(history: TransactionHistory): ActivityItem {
  const typeMap: Record<string, ActivityItem['type']> = {
    'created': 'transaction_created',
    'updated': 'transaction_updated',
    'deleted': 'transaction_deleted',
  };

  const details: ActivityItem['details'] = {
    action: history.action,
  };

  if (history.action === 'updated' && history.changes?.diff) {
    details.changes = history.changes.diff;
  }

  if (history.snapshot?.transaction) {
    details.transaction = history.snapshot.transaction;
  } else if (history.changes?.transaction) {
    details.transaction = history.changes.transaction;
  }

  return {
    id: history.id,
    type: typeMap[history.action] || 'transaction_updated',
    transaction_id: history.transaction_id,
    group_id: history.group_id,
    changed_by: {
      id: history.changed_by,
      email: '', // Will be populated by enrichActivitiesWithEmails
    },
    changed_at: history.changed_at,
    description: generateActivityDescription(history),
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
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50'), 100);
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    // Fetch transaction history for this group
    const { data: historyRecords, error: historyError } = await supabase
      .from('transaction_history')
      .select('*')
      .eq('group_id', groupId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      return handleError(historyError, 'fetching transaction history');
    }

    // Transform history records to activity items
    const activities: ActivityItem[] = (historyRecords || []).map(transformHistoryToActivity);

    // Enrich with email addresses
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    await enrichActivitiesWithEmails(
      supabase,
      supabaseUrl,
      serviceRoleKey,
      activities,
      user.id,
      user.email || null
    );

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('transaction_history')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);

    const total = count || 0;
    const hasMore = offset + activities.length < total;

    return createSuccessResponse({
      activities,
      total,
      has_more: hasMore,
    }, 200, 0); // No caching - real-time data
  } catch (error: unknown) {
    return handleError(error, 'activity handler');
  }
};
