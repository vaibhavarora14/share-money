import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { fetchUserProfiles } from '../_shared/user-profiles.ts';
import { isValidUUID } from '../_shared/validation.ts';

interface Balance {
  user_id: string;
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
  amount: number;
  currency: string;
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
  participant_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  amount: number | string;
}

interface TransactionWithSplits {
  id: number;
  amount: number | string;
  paid_by: string | null; // Legacy
  paid_by_participant_id?: string | null; // New
  currency: string;
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
  supabase: any,
  groupId: string,
  currentUserId: string
): Promise<Balance[]> {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      amount,
      paid_by_participant_id,
      currency,
      transaction_splits (
        participant_id,
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
  
  // Map<UserId, Map<Currency, Amount>>
  const balanceMap = new Map<string, Map<string, number>>();

  const updateBalance = (userId: string, currency: string, amount: number) => {
    if (!balanceMap.has(userId)) {
      balanceMap.set(userId, new Map());
    }
    const userBalances = balanceMap.get(userId)!;
    const currentAmount = userBalances.get(currency) || 0;
    userBalances.set(currency, currentAmount + amount);
  };

  // Collect all unique participant IDs from transactions and settlements
  const allParticipantIds = new Set<string>();
  
  // From transactions
  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    if (tx.paid_by_participant_id) allParticipantIds.add(tx.paid_by_participant_id);
    if (tx.transaction_splits) {
      tx.transaction_splits.forEach(s => {
        if (s.participant_id) allParticipantIds.add(s.participant_id);
      });
    }
  }

  // From settlements
  const { data: settlements, error: settlementsError } = await supabase
    .from('settlements')
    .select('id, group_id, from_participant_id, to_participant_id, amount, currency')
    .eq('group_id', groupId);

  if (settlementsError) {
    log.error('Error fetching settlements', 'balance-calculation', { groupId, error: settlementsError.message });
    throw settlementsError;
  }

  for (const settlement of (settlements || [])) {
    if (settlement.from_participant_id) allParticipantIds.add(settlement.from_participant_id);
    if (settlement.to_participant_id) allParticipantIds.add(settlement.to_participant_id);
  }

  // Map to store participant user_id lookups
  const participantToUserMap = new Map<string, string>();

  // Batch fetch all participants
  if (allParticipantIds.size > 0) {
    const { data: participants } = await supabase
      .from('participants')
      .select('id, user_id')
      .in('id', Array.from(allParticipantIds));
    
    if (participants) {
      participants.forEach((p: any) => {
        if (p.user_id) participantToUserMap.set(p.id, p.user_id);
      });
    }
  }

  // Process Transactions
  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    const currency = tx.currency;
    
    if (isNaN(totalAmount) || totalAmount <= 0) continue;

    const paidByUserId = tx.paid_by_participant_id ? participantToUserMap.get(tx.paid_by_participant_id) : null;
    if (!paidByUserId || !memberIds.has(paidByUserId)) continue;

    if (tx.transaction_splits && Array.isArray(tx.transaction_splits)) {
      const splits = tx.transaction_splits
        .map((s: TransactionSplit) => {
          const amount = typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount;
          const userId = s.participant_id ? participantToUserMap.get(s.participant_id) : null;
          
          if (!userId || isNaN(amount) || amount <= 0) return null;
          return { user_id: userId, amount };
        })
        .filter((s): s is { user_id: string; amount: number } => s !== null);

      if (splits.length === 0) continue;

      const currentUserSplit = splits.find((s) => s.user_id === currentUserId);
      
      if (paidByUserId === currentUserId) {
        for (const split of splits) {
          if (split.user_id !== currentUserId && memberIds.has(split.user_id)) {
            updateBalance(split.user_id, currency, split.amount);
          }
        }
      } else if (currentUserSplit) {
        updateBalance(paidByUserId, currency, -currentUserSplit.amount);
      }
    }
  }

  // Process Settlements
  for (const settlement of (settlements || [])) {
    // Get user_ids from participant_ids or use legacy user_ids as fallback
    let fromUserId: string | null = null;
    let toUserId: string | null = null;
    
    if (settlement.from_participant_id) {
      fromUserId = participantToUserMap.get(settlement.from_participant_id) || null;
    } 
    if (!fromUserId && settlement.from_user_id) {
      fromUserId = settlement.from_user_id;
    }
    
    if (settlement.to_participant_id) {
      toUserId = participantToUserMap.get(settlement.to_participant_id) || null;
    } 
    if (!toUserId && settlement.to_user_id) {
      toUserId = settlement.to_user_id;
    }
    
    if (!fromUserId || !toUserId) {
      continue; 
    }
    
    const settlementAmount = typeof settlement.amount === 'string' 
      ? parseFloat(settlement.amount) 
      : settlement.amount;
    const currency = settlement.currency;

    if (!currency) {
      log.error('Settlement missing currency', 'balance-calculation', { settlementId: settlement.id });
      continue;
    }

    if (isNaN(settlementAmount) || settlementAmount <= 0) {
      continue;
    }

    if (fromUserId === currentUserId && memberIds.has(toUserId)) {
      log.info('Reducing balance (receive)', 'balance-debug', { toUserId, amount: settlementAmount });
      updateBalance(toUserId, currency, settlementAmount);
    } else if (toUserId === currentUserId && memberIds.has(fromUserId)) {
      log.info('Reducing balance (pay)', 'balance-debug', { fromUserId, amount: -settlementAmount });
      updateBalance(fromUserId, currency, -settlementAmount);
    } else {
      log.info('Skipping settlement update', 'balance-debug', { 
        settlementId: settlement.id, 
        currentUserId, 
        fromUserId, 
        toUserId,
        fromMember: memberIds.has(fromUserId || ''),
        toMember: memberIds.has(toUserId || '')
      });
    }
  }

  const balances: Balance[] = [];
  
  for (const [userId, currencyMap] of balanceMap.entries()) {
    if (userId === currentUserId) continue;
    
    for (const [currency, amount] of currencyMap.entries()) {
      const roundedAmount = Math.round(amount * 100) / 100;
      if (Math.abs(roundedAmount) > 0.01) {
        balances.push({
          user_id: userId,
          amount: roundedAmount,
          currency: currency
        });
      }
    }
  }

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

    const balancePromises = targetGroupIds.map(async (gId: string) => {
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
    
    // Map<UserId, Map<Currency, Amount>>
    const overallBalanceMap = new Map<string, Map<string, number>>();

    for (const result of balanceResults) {
      if (result.status === 'fulfilled') {
        const groupBalance = result.value;
        groupBalances.push(groupBalance);

        for (const balance of groupBalance.balances) {
          if (!overallBalanceMap.has(balance.user_id)) {
            overallBalanceMap.set(balance.user_id, new Map());
          }
          const userBalances = overallBalanceMap.get(balance.user_id)!;
          const current = userBalances.get(balance.currency) || 0;
          userBalances.set(balance.currency, current + balance.amount);
        }
      }
    }

    const overallBalances: Balance[] = [];
    for (const [userId, currencyMap] of overallBalanceMap.entries()) {
      for (const [currency, amount] of currencyMap.entries()) {
        const roundedAmount = Math.round(amount * 100) / 100;
        if (Math.abs(roundedAmount) > 0.01) {
          overallBalances.push({
            user_id: userId,
            amount: roundedAmount,
            currency: currency
          });
        }
      }
    }

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
      const [emailMap, profileMap] = await Promise.all([
        fetchUserEmails(userIdsArray, currentUserId, currentUserEmail),
        fetchUserProfiles(supabase, userIdsArray),
      ]);

      for (const gb of groupBalances) {
        for (const b of gb.balances) {
          const profile = profileMap.get(b.user_id);
          b.email = emailMap.get(b.user_id);
          b.full_name = profile?.full_name || null;
          b.avatar_url = profile?.avatar_url || null;
        }
      }
      for (const b of overallBalances) {
        const profile = profileMap.get(b.user_id);
        b.email = emailMap.get(b.user_id);
        b.full_name = profile?.full_name || null;
        b.avatar_url = profile?.avatar_url || null;
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
