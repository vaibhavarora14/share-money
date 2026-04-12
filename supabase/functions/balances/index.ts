import { verifyAuth } from '../_shared/auth.ts';
import { buildParticipantCanonicalResolver } from '../_shared/participant-canonical.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { fetchUserProfiles } from '../_shared/user-profiles.ts';
import { isValidUUID } from '../_shared/validation.ts';

interface Balance {
  user_id: string;
  participant_id?: string;
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
  group_stats?: GroupStatsResponse;
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
  description?: string;
  date?: string;
  type?: string;
  paid_by: string | null; // Legacy
  paid_by_participant_id?: string | null; // New
  currency: string;
  split_among?: string[] | null;
  transaction_splits?: TransactionSplit[];
}

interface StatsMemberBreakdownEntry {
  participant_id: string;
  user_id?: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  share_totals: Record<string, number>;
  paid_totals: Record<string, number>;
  net_balances: Record<string, number>;
}

interface StatsMyTransactionEntry {
  transaction: TransactionWithSplits;
  share_amount: number | null;
  is_payer: boolean;
  net_receivable: number | null;
}

interface StatsSettlementEdge {
  from_participant_id?: string;
  from_user_id?: string;
  from_full_name?: string | null;
  from_email?: string | null;
  from_avatar_url?: string | null;
  to_participant_id?: string;
  to_user_id?: string;
  to_full_name?: string | null;
  to_email?: string | null;
  to_avatar_url?: string | null;
  amount: number;
  currency: string;
}

interface GroupStatsResponse {
  member_breakdown: StatsMemberBreakdownEntry[];
  my_transactions: StatsMyTransactionEntry[];
  totals: {
    my_share: Record<string, number>;
    group_total: Record<string, number>;
    i_owe: Record<string, number>;
    im_owed: Record<string, number>;
  };
  settlement_plan: StatsSettlementEdge[];
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
  currentUserId: string,
  currentUserEmail: string | null
): Promise<Balance[]> {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
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
  
  // Map<ParticipantId/UserId, Map<Currency, Amount>>
  // We'll track by user_id where possible, fallback to participant_id for invited users
  const balanceMap = new Map<string, Map<string, number>>();

  const updateBalance = (key: string, currency: string, amount: number) => {
    if (!balanceMap.has(key)) {
      balanceMap.set(key, new Map());
    }
    const userBalances = balanceMap.get(key)!;
    const currentAmount = userBalances.get(currency) || 0;
    userBalances.set(currency, currentAmount + amount);
  };

  // 1. Fetch all participants to resolve user_ids and names
  const { data: participants } = await supabase
    .from('participants')
    .select('id, user_id, email, full_name, avatar_url, type')
    .eq('group_id', groupId);

  const participantUserIds: string[] = Array.from(
    new Set(
      (participants || [])
        .map((p: { user_id?: string | null }) => p.user_id)
        .filter(
          (id: string | null | undefined): id is string =>
            typeof id === 'string' && id.length > 0
        )
    )
  );
  const userIdToEmail = await fetchUserEmails(
    participantUserIds,
    currentUserId,
    currentUserEmail
  );

  const canonicalParticipantId = buildParticipantCanonicalResolver(
    (participants || []) as {
      id: string;
      user_id: string | null;
      email: string | null;
      type: string;
    }[],
    userIdToEmail
  );

  const participantToUserMap = new Map<string, string>();
  const participantToEmailMap = new Map<string, string>();
  const participantToFullNameMap = new Map<string, string>();
  const participantToAvatarMap = new Map<string, string>();

  if (participants) {
    const rowsByCanonical = new Map<string, any[]>();
    for (const p of participants as any[]) {
      const cid = canonicalParticipantId(p.id);
      if (!rowsByCanonical.has(cid)) rowsByCanonical.set(cid, []);
      rowsByCanonical.get(cid)!.push(p);
    }
    for (const [cid, rows] of rowsByCanonical) {
      const withUser = rows.find((r) => r.user_id);
      if (withUser?.user_id) participantToUserMap.set(cid, withUser.user_id);
      const emailSource =
        rows.find((r) => r.user_id && r.email) || rows.find((r) => r.email);
      if (emailSource?.email) participantToEmailMap.set(cid, emailSource.email);
      const nameSource =
        rows.find((r) => r.user_id && r.full_name) || rows.find((r) => r.full_name);
      if (nameSource?.full_name) {
        participantToFullNameMap.set(cid, nameSource.full_name);
      }
      const avatarSource =
        rows.find((r) => r.user_id && r.avatar_url) ||
        rows.find((r) => r.avatar_url);
      if (avatarSource?.avatar_url) {
        participantToAvatarMap.set(cid, avatarSource.avatar_url);
      }
    }
  }

  // Process Transactions
  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    const currency = tx.currency;
    
    if (isNaN(totalAmount)) continue;

    const paidByPid = tx.paid_by_participant_id;
    if (!paidByPid) continue;

    const paidByKey = canonicalParticipantId(paidByPid);

      if (tx.transaction_splits && Array.isArray(tx.transaction_splits)) {
        const splits = tx.transaction_splits
          .map((s: TransactionSplit) => {
            if (!s) return undefined;
            const amount = typeof s.amount === 'string' ? parseFloat(s.amount) : s.amount;
            if (!s.participant_id || isNaN(amount)) return undefined;
            
            return { pid: canonicalParticipantId(s.participant_id), amount };
          })
          .filter((s): s is { pid: string; amount: number } => !!s);

        if (splits.length === 0) continue;

        // Add credit to payer
        updateBalance(paidByKey, currency, totalAmount);

        // Add debit to each split participant
        for (const split of splits) {
          updateBalance(split.pid, currency, -split.amount);
        }
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

  // Process Settlements
  for (const settlement of (settlements || [])) {
    const fromKey = settlement.from_participant_id
      ? canonicalParticipantId(settlement.from_participant_id)
      : null;
    const toKey = settlement.to_participant_id
      ? canonicalParticipantId(settlement.to_participant_id)
      : null;

    if (!fromKey || !toKey) continue; 
    
    const settlementAmount = typeof settlement.amount === 'string' 
      ? parseFloat(settlement.amount) 
      : settlement.amount;
    const currency = settlement.currency;

    if (isNaN(settlementAmount) || settlementAmount <= 0) continue;

    // From (sender) is less in debt (Credit)
    updateBalance(fromKey, currency, settlementAmount);
    // To (receiver) is less a creditor (Debit)
    updateBalance(toKey, currency, -settlementAmount);
  }

  const balances: Balance[] = [];
  
  for (const [key, currencyMap] of balanceMap.entries()) {
    // Return all balances (including current user) so frontend can calculate full graph
    
    for (const [currency, amount] of currencyMap.entries()) {
      const roundedAmount = Math.round(amount * 100) / 100;
      if (Math.abs(roundedAmount) > 0.01) {
        // Find user_id, email and full_name using PID maps
        const userId = participantToUserMap.get(key);
        const email = participantToEmailMap.get(key);
        const fullName = participantToFullNameMap.get(key);
        const avatarUrl = participantToAvatarMap.get(key);
        
        balances.push({
          user_id: userId || (isValidUUID(key) ? key : ''), // Return UserID if exists (crucial for aggregation)
          participant_id: key, // KEY is now GUARANTEED to be Participant ID (UUID)
          email: email,
          full_name: fullName || null,
          avatar_url: avatarUrl || null,
          amount: roundedAmount,
          currency: currency
        });
      }
    }
  }

  return balances;
}

function addCurrencyAmount(
  target: Record<string, number>,
  currency: string,
  amount: number
) {
  if (!Number.isFinite(amount)) return;
  target[currency] = Math.round(((target[currency] || 0) + amount) * 100) / 100;
}

async function calculateGroupStats(
  supabase: any,
  groupId: string,
  currentUserId: string,
  balances: Balance[]
): Promise<GroupStatsResponse> {
  const { data: participants } = await supabase
    .from('participants')
    .select('id, user_id, email, full_name, avatar_url')
    .eq('group_id', groupId);

  const participantMap = new Map<string, {
    id: string;
    user_id?: string | null;
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  }>();
  (participants || []).forEach((p: any) => participantMap.set(p.id, p));

  const currentParticipantId = (participants || []).find((p: any) => p.user_id === currentUserId)?.id;

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      description,
      date,
      type,
      paid_by_participant_id,
      currency,
      transaction_splits (
        participant_id,
        amount
      )
    `)
    .eq('group_id', groupId)
    .eq('type', 'expense')
    .order('date', { ascending: false })
    .order('id', { ascending: false });

  const memberBreakdownMap = new Map<string, StatsMemberBreakdownEntry>();
  const groupTotal: Record<string, number> = {};
  const myShareTotals: Record<string, number> = {};
  const myTransactions: StatsMyTransactionEntry[] = [];

  const ensureMember = (participantId: string): StatsMemberBreakdownEntry => {
    const existing = memberBreakdownMap.get(participantId);
    if (existing) return existing;

    const participant = participantMap.get(participantId);
    const created: StatsMemberBreakdownEntry = {
      participant_id: participantId,
      user_id: participant?.user_id || undefined,
      email: participant?.email || null,
      full_name: participant?.full_name || null,
      avatar_url: participant?.avatar_url || null,
      share_totals: {},
      paid_totals: {},
      net_balances: {},
    };
    memberBreakdownMap.set(participantId, created);
    return created;
  };

  for (const tx of (transactions || []) as TransactionWithSplits[]) {
    const amount = typeof tx.amount === 'string' ? Number.parseFloat(tx.amount) : tx.amount;
    const currency = tx.currency || 'USD';
    if (!Number.isFinite(amount)) continue;

    addCurrencyAmount(groupTotal, currency, amount);

    if (tx.paid_by_participant_id) {
      const payerEntry = ensureMember(tx.paid_by_participant_id);
      addCurrencyAmount(payerEntry.paid_totals, currency, amount);
    }

    const splits = (tx.transaction_splits || [])
      .map((split) => ({
        participant_id: split.participant_id || null,
        amount: typeof split.amount === 'string'
          ? Number.parseFloat(split.amount)
          : split.amount,
      }))
      .filter((split) => split.participant_id && Number.isFinite(split.amount)) as Array<{ participant_id: string; amount: number }>;

    for (const split of splits) {
      const splitEntry = ensureMember(split.participant_id);
      addCurrencyAmount(splitEntry.share_totals, currency, split.amount);
    }

    const mySplitAmount = currentParticipantId
      ? (splits.find((split) => split.participant_id === currentParticipantId)?.amount ?? null)
      : null;
    const isPayer = !!(currentParticipantId && tx.paid_by_participant_id === currentParticipantId);
    const involved = isPayer || mySplitAmount !== null;

    if (involved) {
      if (mySplitAmount !== null) {
        addCurrencyAmount(myShareTotals, currency, mySplitAmount);
      }
      myTransactions.push({
        transaction: tx,
        share_amount: mySplitAmount,
        is_payer: isPayer,
        net_receivable: isPayer ? Math.round((amount - (mySplitAmount || 0)) * 100) / 100 : null,
      });
    }
  }

  for (const balance of balances) {
    if (!balance.participant_id) continue;
    const entry = ensureMember(balance.participant_id);
    addCurrencyAmount(entry.net_balances, balance.currency, balance.amount);
  }

  const iOwe: Record<string, number> = {};
  const imOwed: Record<string, number> = {};
  const myBalances = balances.filter((balance) => (
    (currentParticipantId && balance.participant_id === currentParticipantId)
    || balance.user_id === currentUserId
  ));
  for (const balance of myBalances) {
    if (balance.amount < 0) {
      addCurrencyAmount(iOwe, balance.currency, Math.abs(balance.amount));
    } else if (balance.amount > 0) {
      addCurrencyAmount(imOwed, balance.currency, balance.amount);
    }
  }

  const settlementPlan: StatsSettlementEdge[] = [];
  const balancesByCurrency = new Map<string, Balance[]>();
  for (const balance of balances) {
    if (!balancesByCurrency.has(balance.currency)) {
      balancesByCurrency.set(balance.currency, []);
    }
    balancesByCurrency.get(balance.currency)!.push(balance);
  }

  for (const [currency, currencyBalances] of balancesByCurrency) {
    const debtors = currencyBalances
      .filter((balance) => balance.amount < -0.01)
      .map((balance) => ({ ...balance, amount: Math.abs(balance.amount) }))
      .sort((a, b) => b.amount - a.amount);
    const creditors = currencyBalances
      .filter((balance) => balance.amount > 0.01)
      .map((balance) => ({ ...balance }))
      .sort((a, b) => b.amount - a.amount);

    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amount = Math.min(debtor.amount, creditor.amount);

      settlementPlan.push({
        from_participant_id: debtor.participant_id,
        from_user_id: debtor.user_id,
        from_full_name: debtor.full_name || null,
        from_email: debtor.email || null,
        from_avatar_url: debtor.avatar_url || null,
        to_participant_id: creditor.participant_id,
        to_user_id: creditor.user_id,
        to_full_name: creditor.full_name || null,
        to_email: creditor.email || null,
        to_avatar_url: creditor.avatar_url || null,
        amount: Math.round(amount * 100) / 100,
        currency,
      });

      debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
      creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
      if (debtor.amount <= 0.01) debtorIndex += 1;
      if (creditor.amount <= 0.01) creditorIndex += 1;
    }
  }

  return {
    member_breakdown: Array.from(memberBreakdownMap.values()),
    my_transactions: myTransactions,
    totals: {
      my_share: myShareTotals,
      group_total: groupTotal,
      i_owe: iOwe,
      im_owed: imOwed,
    },
    settlement_plan: settlementPlan,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  try {
    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication', req);
    }

    const { user, supabase } = authResult;
    const currentUserId = user.id;
    const currentUserEmail = user.email;

    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id');
    const includeStats = url.searchParams.get('include_stats') === 'true';
    
    if (groupId && !isValidUUID(groupId)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }

    if (includeStats && !groupId) {
      return createErrorResponse(400, 'group_id is required when include_stats=true', 'VALIDATION_ERROR', undefined, req);
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
        const balances = await calculateGroupBalances(
          supabase,
          gId,
          currentUserId,
          currentUserEmail ?? null
        );
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
      // Overall balances (across groups) should only return the requester's position
      if (userId !== currentUserId) continue;
      
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
          const profile = b.user_id ? profileMap.get(b.user_id) : null;
          if (b.user_id) {
            const authEmail = emailMap.get(b.user_id);
            if (authEmail) b.email = authEmail;
          }
          // Only overwrite if profile has data (merging auth profile over participant data)
          b.full_name = profile?.full_name || b.full_name || null;
          b.avatar_url = profile?.avatar_url || b.avatar_url || null;
        }
      }
      for (const b of overallBalances) {
        const profile = b.user_id ? profileMap.get(b.user_id) : null;
        if (b.user_id) {
          const authEmail = emailMap.get(b.user_id);
          if (authEmail) b.email = authEmail;
        }
        b.full_name = profile?.full_name || b.full_name || null;
        b.avatar_url = profile?.avatar_url || b.avatar_url || null;
      }
    }

    const response: BalancesResponse = {
      group_balances: groupBalances,
      overall_balances: overallBalances,
    };

    if (includeStats && groupId) {
      const targetGroup = groupBalances.find((gb) => gb.group_id === groupId);
      response.group_stats = await calculateGroupStats(
        supabase,
        groupId,
        currentUserId,
        targetGroup?.balances || []
      );
    }

    return createSuccessResponse(response, 200, 0, req);
  } catch (error: unknown) {
    return handleError(error, 'balances handler', req);
  }
});
