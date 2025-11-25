import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { isValidUUID } from '../_shared/validation.ts';
import { createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { log } from '../_shared/logger.ts';

interface Balance {
  user_id: string;
  email?: string;
  amount: number;
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

interface GroupMember {
  user_id: string;
}

interface Group {
  id: string;
  name: string;
}

interface TransactionSplit {
  user_id: string;
  amount: number | string;
}

interface TransactionWithSplits {
  id: number;
  amount: number | string;
  paid_by: string | null;
  currency?: string;
  split_among?: string[] | null;
  transaction_splits?: TransactionSplit[];
}

/**
 * Balances Edge Function
 * 
 * Calculates and returns balances between users in groups:
 * - GET /balances?group_id=xxx - Get balances (optionally filtered by group)
 * 
 * Returns both per-group balances and overall balances across all groups.
 * 
 * @route /functions/v1/balances
 * @requires Authentication
 */

async function calculateGroupBalances(
  supabase: SupabaseClient,
  groupId: string,
  currentUserId: string
): Promise<Balance[]> {
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
      log.error('Error fetching transactions', 'balance-calculation', { groupId, error: error.message });
      throw error;
    }

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  const memberIds = new Set((members || []).map((m: GroupMember) => m.user_id));
  const balanceMap = new Map<string, number>();

  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    const paidBy = tx.paid_by;
    const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    
    if (isNaN(totalAmount) || totalAmount <= 0) {
      log.warn('Invalid transaction amount', 'balance-calculation', {
        transactionId: tx.id,
        amount: tx.amount,
        groupId,
      });
      continue;
    }

    let splits: Array<{ user_id: string; amount: number }> = [];

    if (tx.transaction_splits && Array.isArray(tx.transaction_splits) && tx.transaction_splits.length > 0) {
      splits = tx.transaction_splits
        .map((s: TransactionSplit) => {
          const amount = typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount;
          if (isNaN(amount) || amount <= 0) {
            log.warn('Invalid split amount', 'balance-calculation', {
              transactionId: tx.id,
              userId: s.user_id,
              amount: s.amount,
              groupId,
            });
            return null;
          }
          return {
            user_id: s.user_id,
            amount,
          };
        })
        .filter((s): s is { user_id: string; amount: number } => s !== null);
    } else if (tx.split_among && Array.isArray(tx.split_among) && tx.split_among.length > 0) {
      const splitCount = tx.split_among.length;
      if (splitCount === 0) {
        continue;
      }
      const splitAmount = totalAmount / splitCount;
      splits = tx.split_among.map((userId: string) => ({
        user_id: userId,
        amount: Math.round((splitAmount) * 100) / 100,
      }));
      if (splits.length > 0) {
        const sum = splits.reduce((acc, s) => acc + s.amount, 0);
        const diff = totalAmount - sum;
        if (Math.abs(diff) > 0.001) {
          splits[0].amount = Math.round((splits[0].amount + diff) * 100) / 100;
        }
      }
    }

    if (splits.length === 0 || !paidBy || !memberIds.has(paidBy)) {
      continue;
    }

    const currentUserSplit = splits.find((s) => s.user_id === currentUserId);
    
    if (paidBy === currentUserId) {
      for (const split of splits) {
        if (split.user_id !== currentUserId && memberIds.has(split.user_id)) {
          const current = balanceMap.get(split.user_id) || 0;
          balanceMap.set(split.user_id, current + split.amount);
        }
      }
    } else if (currentUserSplit) {
      const current = balanceMap.get(paidBy) || 0;
      balanceMap.set(paidBy, current - currentUserSplit.amount);
    }
  }

  const { data: settlements } = await supabase
    .from('settlements')
    .select('from_user_id, to_user_id, amount')
    .eq('group_id', groupId);

  for (const settlement of (settlements || [])) {
    const fromUserId = settlement.from_user_id;
    const toUserId = settlement.to_user_id;
    const settlementAmount = typeof settlement.amount === 'string' 
      ? parseFloat(settlement.amount) 
      : settlement.amount;

    if (isNaN(settlementAmount) || settlementAmount <= 0) {
      continue;
    }

    if (fromUserId === currentUserId && memberIds.has(toUserId)) {
      const current = balanceMap.get(toUserId) || 0;
      balanceMap.set(toUserId, current + settlementAmount);
    } else if (toUserId === currentUserId && memberIds.has(fromUserId)) {
      const current = balanceMap.get(fromUserId) || 0;
      balanceMap.set(fromUserId, current - settlementAmount);
    }
  }

  const balances: Balance[] = Array.from(balanceMap.entries())
    .filter(([userId]) => userId !== currentUserId)
    .map(([user_id, amount]) => ({
      user_id,
      amount: Math.round(amount * 100) / 100,
    }))
    .filter((b) => Math.abs(b.amount) > 0.01);

  return balances;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200 });
  }

  try {
    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabase } = authResult;
    const currentUserId = user.id;
    const currentUserEmail = user.email;

    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id');
    
    if (groupId && !isValidUUID(groupId)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
    }

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', currentUserId);

    interface Membership {
      group_id: string;
    }
    const groupIds = (memberships || []).map((m: Membership) => m.group_id);

    const targetGroupIds = groupId 
      ? (groupIds.includes(groupId) ? [groupId] : [])
      : groupIds;

    if (targetGroupIds.length === 0) {
      return createSuccessResponse({
        group_balances: [],
        overall_balances: [],
      }, 200, 0);
    }

    const { data: groups } = await supabase
      .from('groups')
      .select('id, name')
      .in('id', targetGroupIds);

    const groupMap = new Map((groups || []).map((g: Group) => [g.id, g.name]));

    const balancePromises = targetGroupIds.map(async (gId) => {
      try {
        const balances = await calculateGroupBalances(supabase, gId, currentUserId);
        const groupName = groupMap.get(gId) || 'Unknown Group';
        return {
          group_id: gId,
          group_name: groupName,
          balances,
        };
      } catch (error) {
        return {
          group_id: gId,
          group_name: groupMap.get(gId) || 'Unknown Group',
          balances: [],
        };
      }
    });

    const balanceResults = await Promise.allSettled(balancePromises);
    const groupBalances: GroupBalance[] = [];
    const overallBalanceMap = new Map<string, number>();

    for (const result of balanceResults) {
      if (result.status === 'fulfilled') {
        const groupBalance = result.value;
        groupBalances.push(groupBalance);

        for (const balance of groupBalance.balances) {
          const current = overallBalanceMap.get(balance.user_id) || 0;
          overallBalanceMap.set(balance.user_id, current + balance.amount);
        }
      }
    }

    const overallBalances: Balance[] = Array.from(overallBalanceMap.entries())
      .map(([user_id, amount]) => ({
        user_id,
        amount: Math.round(amount * 100) / 100,
      }))
      .filter((b) => Math.abs(b.amount) > 0.01);

    const allUserIds = new Set<string>();
    
    for (const gb of groupBalances) {
      for (const b of gb.balances) {
        allUserIds.add(b.user_id);
      }
    }
    for (const b of overallBalances) {
      allUserIds.add(b.user_id);
    }

    if (allUserIds.size > 0) {
      const userIdsArray = Array.from(allUserIds);
      const emailMap = await fetchUserEmails(userIdsArray, currentUserId, currentUserEmail);

      for (const gb of groupBalances) {
        for (const b of gb.balances) {
          b.email = emailMap.get(b.user_id);
        }
      }
      for (const b of overallBalances) {
        b.email = emailMap.get(b.user_id);
      }
    }

    const response: BalancesResponse = {
      group_balances: groupBalances,
      overall_balances: overallBalances,
    };

    return createSuccessResponse(response, 200, 0);
  } catch (error: unknown) {
    return handleError(error, 'balances handler');
  }
});
