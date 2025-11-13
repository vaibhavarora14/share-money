import { Handler } from '@netlify/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Get CORS headers with configurable origin.
 * In production, set ALLOWED_ORIGIN environment variable to restrict access.
 * Falls back to '*' for development if not set.
 */
function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

interface Balance {
  user_id: string;
  email?: string;
  amount: number; // Positive = they owe you, Negative = you owe them
}

interface GroupBalance {
  group_id: string;
  group_name: string;
  balances: Balance[];
}

interface BalancesResponse {
  group_balances: GroupBalance[];
  overall_balances: Balance[];
}

// Database type interfaces
interface GroupMember {
  user_id: string;
}

interface Group {
  id: string;
  name: string;
}

interface TransactionSplit {
  user_id: string;
  amount: number | string; // Can be string from DB, parsed to number
}

interface TransactionWithSplits {
  id: number;
  amount: number | string; // Can be string from DB, parsed to number
  paid_by: string | null;
  currency?: string;
  split_among?: string[] | null;
  transaction_splits?: TransactionSplit[];
}

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

interface EmailFetchResult {
  userId: string;
  email: string | null;
}

/**
 * Calculates balances for a user in a specific group.
 * Returns an array of balances where:
 * - Positive amount = that user owes the current user
 * - Negative amount = current user owes that user
 */
async function calculateGroupBalances(
  supabase: SupabaseClient,
  groupId: string,
  currentUserId: string
): Promise<Balance[]> {
  // Fetch all expense transactions for this group
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      paid_by,
      currency,
      split_among,
      transaction_splits (
        user_id,
        amount
      )
    `)
    .eq('group_id', groupId)
    .eq('type', 'expense');

  if (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }

  // Get group members to map user IDs to emails
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  const memberIds = new Set((members || []).map((m: GroupMember) => m.user_id));

  // Initialize balance map: user_id -> balance amount
  const balanceMap = new Map<string, number>();

  // Process each transaction
  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    const paidBy = tx.paid_by;
    const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;

    // Determine who owes what
    let splits: Array<{ user_id: string; amount: number }> = [];

    // Prefer transaction_splits (normalized data)
    if (tx.transaction_splits && Array.isArray(tx.transaction_splits) && tx.transaction_splits.length > 0) {
      splits = tx.transaction_splits.map((s: TransactionSplit) => ({
        user_id: s.user_id,
        amount: typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount,
      }));
    } else if (tx.split_among && Array.isArray(tx.split_among) && tx.split_among.length > 0) {
      // Fallback to split_among for backward compatibility
      // Calculate equal splits
      const splitCount = tx.split_among.length;
      const splitAmount = totalAmount / splitCount;
      splits = tx.split_among.map((userId: string) => ({
        user_id: userId,
        amount: Math.round((splitAmount) * 100) / 100,
      }));
      // Adjust first split to account for rounding
      if (splits.length > 0) {
        const sum = splits.reduce((acc, s) => acc + s.amount, 0);
        const diff = totalAmount - sum;
        if (Math.abs(diff) > 0.001) {
          splits[0].amount = Math.round((splits[0].amount + diff) * 100) / 100;
        }
      }
    }

    // If no splits or no paid_by, skip this transaction (invalid expense)
    if (splits.length === 0 || !paidBy || !memberIds.has(paidBy)) {
      continue;
    }

    // Find current user's split
    const currentUserSplit = splits.find((s) => s.user_id === currentUserId);
    
    if (paidBy === currentUserId) {
      // Current user paid the full amount
      // They are owed money by everyone else in the splits
      for (const split of splits) {
        if (split.user_id !== currentUserId && memberIds.has(split.user_id)) {
          // This person owes the current user their split amount
          const current = balanceMap.get(split.user_id) || 0;
          balanceMap.set(split.user_id, current + split.amount);
        }
      }
    } else if (currentUserSplit) {
      // Someone else paid, and current user is in the splits
      // Current user owes the payer their share
      const current = balanceMap.get(paidBy) || 0;
      balanceMap.set(paidBy, current - currentUserSplit.amount);
    }
  }

  // Convert map to array
  const balances: Balance[] = Array.from(balanceMap.entries())
    .filter(([userId]) => userId !== currentUserId) // Exclude self
    .map(([user_id, amount]) => ({
      user_id,
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
    }))
    .filter((b) => Math.abs(b.amount) > 0.01); // Filter out near-zero balances

  return balances;
}

export const handler: Handler = async (event, context) => {
  const corsHeaders = getCorsHeaders();
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Get Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Supabase credentials' }),
      };
    }

    // Get authorization header
    const authHeader = 
      event.headers.authorization || 
      event.headers.Authorization ||
      event.headers['authorization'] ||
      event.headers['Authorization'] ||
      (event.multiValueHeaders && (
        event.multiValueHeaders.authorization?.[0] ||
        event.multiValueHeaders.Authorization?.[0]
      ));
    
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
      };
    }

    // Verify the user
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': authHeader,
        'apikey': supabaseKey,
      },
    });

    if (!userResponse.ok) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid or expired token'
        }),
      };
    }

    const user = await userResponse.json() as UserResponse;
    
    if (!user || !user.id) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid user data'
        }),
      };
    }

    const currentUserId = user.id;
    const currentUserEmail = user.email || user.user?.email || null;

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

    // Get group_id from query params (optional - if not provided, return all groups)
    const groupId = event.queryStringParameters?.group_id;

    // Get all groups the user belongs to
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', currentUserId);

    interface Membership {
      group_id: string;
    }
    const groupIds = (memberships || []).map((m: Membership) => m.group_id);

    // If group_id is provided, filter to that group
    const targetGroupIds = groupId 
      ? (groupIds.includes(groupId) ? [groupId] : [])
      : groupIds;

    if (targetGroupIds.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_balances: [],
          overall_balances: [],
        }),
      };
    }

    // Get group details
    const { data: groups } = await supabase
      .from('groups')
      .select('id, name')
      .in('id', targetGroupIds);

    const groupMap = new Map((groups || []).map((g: Group) => [g.id, g.name]));

    // Calculate balances for each group
    const groupBalances: GroupBalance[] = [];
    const overallBalanceMap = new Map<string, number>();

    for (const gId of targetGroupIds) {
      try {
        const balances = await calculateGroupBalances(supabase, gId, currentUserId);
        const groupName = groupMap.get(gId) || 'Unknown Group';

        groupBalances.push({
          group_id: gId,
          group_name: groupName,
          balances,
        });

        // Aggregate into overall balances
        for (const balance of balances) {
          const current = overallBalanceMap.get(balance.user_id) || 0;
          overallBalanceMap.set(balance.user_id, current + balance.amount);
        }
      } catch (error) {
        console.error(`Error calculating balances for group ${gId}:`, error);
        // Continue with other groups
      }
    }

    // Convert overall balance map to array
    const overallBalances: Balance[] = Array.from(overallBalanceMap.entries())
      .map(([user_id, amount]) => ({
        user_id,
        amount: Math.round(amount * 100) / 100,
      }))
      .filter((b) => Math.abs(b.amount) > 0.01);

    // Try to enrich balances with email addresses
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const allUserIds = new Set<string>();
    
    // Collect all user IDs
    for (const gb of groupBalances) {
      for (const b of gb.balances) {
        allUserIds.add(b.user_id);
      }
    }
    for (const b of overallBalances) {
      allUserIds.add(b.user_id);
    }

    // Enrich with emails
    if (serviceRoleKey && allUserIds.size > 0) {
      const userIdsArray = Array.from(allUserIds);
      
      // Fetch emails in parallel for better performance
      const emailPromises: Promise<EmailFetchResult>[] = userIdsArray.map(async (userId): Promise<EmailFetchResult> => {
        // If this is the current user, use their email directly
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
          console.error(`Error fetching email for user ${userId}:`, err);
        }
        return { userId, email: null };
      });

      // Wait for all email fetches to complete (in parallel)
      const emailResults = await Promise.allSettled(emailPromises);
      const emailMap = new Map<string, string>();
      
      for (const result of emailResults) {
        if (result.status === 'fulfilled' && result.value.email) {
          emailMap.set(result.value.userId, result.value.email);
        }
      }

      // Add emails to balances
      for (const gb of groupBalances) {
        for (const b of gb.balances) {
          b.email = emailMap.get(b.user_id);
        }
      }
      for (const b of overallBalances) {
        b.email = emailMap.get(b.user_id);
      }
    } else {
      // At least set current user's email if available
      for (const gb of groupBalances) {
        for (const b of gb.balances) {
          if (b.user_id === currentUserId && currentUserEmail) {
            b.email = currentUserEmail;
          }
        }
      }
      for (const b of overallBalances) {
        if (b.user_id === currentUserId && currentUserEmail) {
          b.email = currentUserEmail;
        }
      }
    }

    const response: BalancesResponse = {
      group_balances: groupBalances,
      overall_balances: overallBalances,
    };

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: errorMessage }),
    };
  }
};
