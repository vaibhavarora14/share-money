import { Handler } from '@netlify/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthResult, verifyAuth } from '../utils/auth';
import { createErrorResponse, handleError } from '../utils/error-handler';
import { createEmptyResponse, createSuccessResponse } from '../utils/response';
import { isValidUUID } from '../utils/validation';

interface TransactionHistory {
  id: string;
  transaction_id: number | null; // Nullable for deleted transactions
  settlement_id: string | null; // Nullable for settlements
  activity_type: 'transaction' | 'settlement';
  group_id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_by: string;
  changed_at: string;
  changes: any;
  snapshot: any;
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
  details: {
    action: 'created' | 'updated' | 'deleted';
    changes?: {
      [field: string]: {
        old: any;
        new: any;
      };
    };
    transaction?: any;
    settlement?: any;
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
 * Fetches email for a single user ID
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
    }
  } catch (err) {
    // Log error but continue - email enrichment is optional
  }
  return null;
}

/**
 * Enriches activity items with email addresses for changed_by users and split users
 */
async function enrichActivitiesWithEmails(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  activities: ActivityItem[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  
  if (!serviceRoleKey || activities.length === 0) {
    return emailMap;
  }

  const userIds = new Set<string>();
  
  // Collect user IDs from changed_by
  activities.forEach(a => {
    userIds.add(a.changed_by.id);
  });
  
  // Collect user IDs from split changes in history records
  // We need to check the raw history records, not the transformed activities
  // This will be done separately before transformation

  const userIdsArray = Array.from(userIds);
  
  // Fetch emails in parallel
  const emailPromises = userIdsArray.map(async (userId): Promise<{ userId: string; email: string | null }> => {
    const email = await fetchUserEmail(userId, supabaseUrl, serviceRoleKey, currentUserId, currentUserEmail);
    return { userId, email };
  });

  const emailResults = await Promise.allSettled(emailPromises);
  
  for (const result of emailResults) {
    if (result.status === 'fulfilled' && result.value.email) {
      emailMap.set(result.value.userId, result.value.email);
    }
  }

  // Add emails to activities' changed_by
  activities.forEach(a => {
    const email = emailMap.get(a.changed_by.id);
    if (email) {
      a.changed_by.email = email;
    } else {
      // Fallback to user ID if email not found
      a.changed_by.email = a.changed_by.id.substring(0, 8) + '...';
    }
  });
  
  return emailMap;
}

/**
 * Generates human-readable description for an activity item
 */
function generateActivityDescription(
  history: TransactionHistory,
  emailMap?: Map<string, string>
): string {
  const action = history.action;
  const changes = history.changes;
  const snapshot = history.snapshot;

  const activityType = history.activity_type || 'transaction';
  
  switch (action) {
    case 'created': {
      if (activityType === 'settlement') {
        const settlement = snapshot || changes?.settlement;
        if (settlement) {
          const amount = settlement.amount || 0;
          const fromUserId = settlement.from_user_id;
          const toUserId = settlement.to_user_id;
          const notes = settlement.notes;
          
          // Get user names from email map if available
          let fromName = 'User';
          let toName = 'User';
          if (emailMap) {
            const fromEmail = emailMap.get(fromUserId);
            const toEmail = emailMap.get(toUserId);
            if (fromEmail) fromName = fromEmail.split('@')[0];
            if (toEmail) toName = toEmail.split('@')[0];
          }
          
          let description = `${fromName} paid ${toName} ${formatCurrency(amount)}`;
          if (notes) {
            const notesGlimpse = notes.length > 20 ? notes.substring(0, 20) + '...' : notes;
            description += ` - ${notesGlimpse}`;
          }
          return description;
        }
        return 'Created settlement';
      } else {
        // Transaction created
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
    }

    case 'updated': {
      if (activityType === 'settlement') {
        const diff = changes?.diff || {};
        const userVisibleFields = Object.keys(diff).filter(field => 
          !['created_at', 'id'].includes(field)
        );
        
        if (userVisibleFields.length === 0) {
          return 'Updated settlement';
        }
        
        const settlement = snapshot?.settlement || changes?.settlement;
        const amount = settlement?.amount || 0;
        const fromUserId = settlement?.from_user_id;
        const toUserId = settlement?.to_user_id;
        
        // Get user names from email map if available
        let fromName = 'User';
        let toName = 'User';
        if (emailMap) {
          const fromEmail = emailMap.get(fromUserId);
          const toEmail = emailMap.get(toUserId);
          if (fromEmail) fromName = fromEmail.split('@')[0];
          if (toEmail) toName = toEmail.split('@')[0];
        }
        
        const fieldChanges: string[] = [];
        userVisibleFields.forEach(field => {
          const { old: oldVal, new: newVal } = diff[field];
          const fieldDisplayName = formatFieldName(field);
          
          if (field === 'amount') {
            fieldChanges.push(`Amount: ${formatValue(field, oldVal)} → ${formatValue(field, newVal)}`);
          } else if (field === 'notes') {
            const oldNotes = oldVal || 'none';
            const newNotes = newVal || 'none';
            fieldChanges.push(`Notes: ${oldNotes} → ${newNotes}`);
          } else {
            fieldChanges.push(`${fieldDisplayName}: ${formatValue(field, oldVal)} → ${formatValue(field, newVal)}`);
          }
        });
        
        return `${fromName} paid ${toName} ${formatCurrency(amount)} - ${fieldChanges.join(', ')}`;
      } else {
        // Transaction updated
        const diff = changes?.diff || {};
        // Filter out technical fields that shouldn't be shown to users
        const userVisibleFields = Object.keys(diff).filter(field => 
          !['updated_at', 'created_at', 'id'].includes(field)
        );
        
        if (userVisibleFields.length === 0) {
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
      
      userVisibleFields.forEach(field => {
        const { old: oldVal, new: newVal } = diff[field];
        
        // Format field name for display
        const fieldDisplayName = formatFieldName(field);
        
        if (field === 'split_among') {
          // Special handling for splits - show who was added/removed
          const oldSplits = Array.isArray(oldVal) ? oldVal : [];
          const newSplits = Array.isArray(newVal) ? newVal : [];
          const oldSet = new Set(oldSplits);
          const newSet = new Set(newSplits);
          
          // Find added users
          const addedUsers = newSplits.filter((id: string) => !oldSet.has(id));
          // Find removed users
          const removedUsers = oldSplits.filter((id: string) => !newSet.has(id));
          
          if (addedUsers.length > 0 || removedUsers.length > 0) {
            const changes: string[] = [];
            
            if (addedUsers.length > 0) {
              const userNames = addedUsers.map((userId: string) => {
                if (emailMap) {
                  const email = emailMap.get(userId);
                  if (email) {
                    return email.split('@')[0]; // Show username part
                  }
                }
                return userId.substring(0, 8) + '...';
              });
              
              if (addedUsers.length === 1) {
                changes.push(`added ${userNames[0]} to splits`);
              } else {
                changes.push(`added ${userNames.join(', ')} to splits`);
              }
            }
            
            if (removedUsers.length > 0) {
              const userNames = removedUsers.map((userId: string) => {
                if (emailMap) {
                  const email = emailMap.get(userId);
                  if (email) {
                    return email.split('@')[0]; // Show username part
                  }
                }
                return userId.substring(0, 8) + '...';
              });
              
              if (removedUsers.length === 1) {
                changes.push(`removed ${userNames[0]} from splits`);
              } else {
                changes.push(`removed ${userNames.join(', ')} from splits`);
              }
            }
            
            fieldChanges.push(changes.join(', '));
          } else {
            // Same people but maybe amounts changed
            fieldChanges.push(`changed splits`);
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
    }

    case 'deleted': {
      if (activityType === 'settlement') {
        const settlement = snapshot || changes?.settlement;
        if (settlement) {
          const amount = settlement.amount || 0;
          const fromUserId = settlement.from_user_id;
          const toUserId = settlement.to_user_id;
          
          // Get user names from email map if available
          let fromName = 'User';
          let toName = 'User';
          if (emailMap) {
            const fromEmail = emailMap.get(fromUserId);
            const toEmail = emailMap.get(toUserId);
            if (fromEmail) fromName = fromEmail.split('@')[0];
            if (toEmail) toName = toEmail.split('@')[0];
          }
          
          return `Deleted settlement: ${fromName} paid ${toName} ${formatCurrency(amount)}`;
        }
        return 'Deleted settlement';
      } else {
        // Transaction deleted
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
    }

    default:
      return 'Transaction activity';
  }
}

/**
 * Formats field names for display (user-friendly)
 */
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    'amount': 'Amount',
    'description': 'Description',
    'date': 'Date',
    'category': 'Category',
    'type': 'Type',
    'paid_by': 'Paid by',
    'split_among': 'Splits',
    'currency': 'Currency',
    'notes': 'Notes',
    'from_user_id': 'From',
    'to_user_id': 'To',
  };
  return fieldMap[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
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
    return `${value.length} person${value.length !== 1 ? 's' : ''}`;
  }
  
  if (field === 'paid_by' && typeof value === 'string') {
    // For paid_by, just show "User" since we don't have email context here
    return 'User';
  }
  
  if (Array.isArray(value)) {
    return `${value.length} item${value.length !== 1 ? 's' : ''}`;
  }
  
  // Truncate long strings (like UUIDs or long descriptions)
  const str = String(value);
  if (str.length > 25) {
    return str.substring(0, 25) + '...';
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
function transformHistoryToActivity(
  history: TransactionHistory,
  emailMap?: Map<string, string>
): ActivityItem {
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
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50'), 100);
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    // Fetch transaction history only for this group (filter out settlements)
    const { data: historyRecords, error: historyError } = await supabase
      .from('transaction_history')
      .select('*')
      .eq('group_id', groupId)
      .eq('activity_type', 'transaction') // Only show transaction activities
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (historyError) {
      return handleError(historyError, 'fetching transaction history');
    }

    // Collect all user IDs that need email enrichment
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const userIds = new Set<string>();
    
    // Collect user IDs from changed_by
    (historyRecords || []).forEach((h: TransactionHistory) => {
      userIds.add(h.changed_by);
    });
    
    // Collect user IDs from split changes
    (historyRecords || []).forEach((h: TransactionHistory) => {
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
    
    // Fetch all emails
    const emailMap = new Map<string, string>();
    if (serviceRoleKey && userIds.size > 0) {
      const userIdsArray = Array.from(userIds);
      const emailPromises = userIdsArray.map(async (userId): Promise<{ userId: string; email: string | null }> => {
        const email = await fetchUserEmail(userId, supabaseUrl, serviceRoleKey, user.id, user.email || null);
        return { userId, email };
      });
      
      const emailResults = await Promise.allSettled(emailPromises);
      for (const result of emailResults) {
        if (result.status === 'fulfilled' && result.value.email) {
          emailMap.set(result.value.userId, result.value.email);
        }
      }
    }
    
    // Transform history records to activity items with email map
    const activities: ActivityItem[] = (historyRecords || []).map((h: TransactionHistory) => 
      transformHistoryToActivity(h, emailMap)
    );
    
    // Ensure changed_by emails are set
    activities.forEach(a => {
      const email = emailMap.get(a.changed_by.id);
      if (email) {
        a.changed_by.email = email;
      } else {
        a.changed_by.email = a.changed_by.id.substring(0, 8) + '...';
      }
    });

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
