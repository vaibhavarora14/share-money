import { verifyAuth } from '../_shared/auth.ts';
import { formatCurrency } from '../_shared/currency.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidUUID, validateBodySize, validateTransactionData } from '../_shared/validation.ts';

/**
 * Transactions Edge Function
 * 
 * Handles CRUD operations for transactions:
 * - GET /transactions?group_id=xxx - Fetch transactions (optionally filtered by group)
 * - POST /transactions - Create new transaction
 * - PUT /transactions - Update existing transaction
 * - DELETE /transactions?id=xxx - Delete transaction
 * 
 * Supports expense splitting with automatic calculation of equal splits.
 * 
 * @route /functions/v1/transactions
 * @requires Authentication
 */

interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category?: string;
  user_id?: string;
  group_id?: string;
  currency?: string;
  paid_by_participant_id?: string; // Participant who paid
  split_among_participant_ids?: string[]; // Array of participant IDs to split among
}

interface TransactionSplit {
  transaction_id: number;
  participant_id: string | null; // New: participant reference (nullable for backward compatibility)
  user_id?: string | null; // Legacy: kept for backward compatibility
  email?: string | null; // Legacy: kept for backward compatibility
  amount: number;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface Participant {
  id: string;
  group_id: string;
  user_id?: string | null;
  email?: string | null;
  type: 'member' | 'invited' | 'former';
  role?: 'owner' | 'member';
  full_name?: string | null;
  avatar_url?: string | null;
}

interface TransactionWithSplits extends Transaction {
  transaction_splits?: TransactionSplit[];
  splits?: TransactionSplit[];
}

/**
 * Calculates equal split amounts for a given total amount.
 * Now uses participant_ids instead of user_ids/emails.
 */
function calculateEqualSplits(
  totalAmount: number,
  participantIds: string[] // Array of participant UUIDs
): TransactionSplit[] {
  const uniqueParticipantIds = [...new Set(participantIds)];
  const splitCount = uniqueParticipantIds.length;

  if (splitCount === 0) {
    return [];
  }

  const baseAmount = Math.floor((totalAmount * 100) / splitCount) / 100;
  const baseSum = baseAmount * splitCount;
  const remainder = Math.round((totalAmount - baseSum) * 100) / 100;

  const splits: TransactionSplit[] = uniqueParticipantIds.map((participantId, index) => {
    const amount = index === 0
      ? Math.round((baseAmount + remainder) * 100) / 100
      : baseAmount;
    
    return {
      transaction_id: 0,
      participant_id: participantId,
      amount: amount,
    };
  });

  return splits;
}

/**
 * Validates that the sum of split amounts equals the transaction amount.
 */
function validateSplitSum(
  splits: Array<{ amount: number }>,
  transactionAmount: number,
  currencyCode: string = 'USD'
): { valid: boolean; error?: string } {
  const sum = splits.reduce((acc, split) => acc + split.amount, 0);
  const difference = Math.abs(sum - transactionAmount);
  const tolerance = 0.01;

  if (difference > tolerance) {
    return {
      valid: false,
      error: `Split amounts sum (${formatCurrency(sum, currencyCode)}) does not equal transaction amount (${formatCurrency(transactionAmount, currencyCode)}). Difference: ${formatCurrency(difference, currencyCode)}`,
    };
  }

  return { valid: true };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Validate request body size
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Verify authentication
    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabase } = authResult;
    const httpMethod = req.method;
    const url = new URL(req.url);

    // Handle GET - Fetch transactions (optionally filtered by group_id)
    if (httpMethod === 'GET') {
      const groupId = url.searchParams.get('group_id');
      
      if (groupId && !isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }
      
      let query = supabase
        .from('transactions')
        .select(`
          *,
          transaction_splits (
            id,
            participant_id,
            amount,
            created_at
          )
        `);

      if (groupId) {
        query = query.eq('group_id', groupId);

        // Fetch user's participant record to check status and ID
        const { data: participantData, error: participantAuthError } = await supabase
          .from('participants')
          .select('id, type')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .single();

        if (participantAuthError || !participantData) {
          return createErrorResponse(403, 'Forbidden: You are not a participant in this group', 'PERMISSION_DENIED');
        }

        // If user is not active (e.g. 'former'), restrict visibility
        // Showing only transactions they are involved in (Personal Relevance View)
        if (participantData.type === 'former') {
          // We can't easily filter by "split inclusion" in the main query without complex RPC
          // So we'll fetch broader range and filter in memory.
          // Note: This might miss older transactions if limit(100) cuts them off.
          // For now, this tradeoff is acceptable or we could increase limit for former members.
        }
      }

      const { data: transactionsData, error } = await query
        .order('date', { ascending: false })
        .limit(200); // Increased limit to accommodate filtering

      if (error) {
        return handleError(error, 'fetching transactions');
      }

      let transactions = transactionsData || [];
      if (groupId) {
         const { data: participantCheck } = await supabase
          .from('participants')
          .select('id, type')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .maybeSingle();
         
         if (participantCheck && participantCheck.type === 'former') {
             const pId = participantCheck.id;
             transactions = transactions.filter((tx: any) => {
                 const isPayer = tx.paid_by_participant_id === pId;
                 // Check splits (fetched via join as transaction_splits)
                 const isInSplits = tx.transaction_splits?.some((s: any) => s.participant_id === pId);
                 // Check legacy fields just in case
                 const isLegacyPayer = tx.paid_by === user.id || tx.user_id === user.id;
                 const isLegacySplit = tx.split_among?.includes(user.id);
                 
                 return isPayer || isInSplits || isLegacyPayer || isLegacySplit;
             });
         }
      }

      // Collect all participant IDs from splits and paid_by to enrich with participant data
      const allParticipantIds = new Set<string>();
      
      (transactions || []).forEach((tx: TransactionWithSplits) => {
        if (tx.transaction_splits) {
          tx.transaction_splits.forEach((split) => {
            if (split.participant_id) {
              allParticipantIds.add(split.participant_id);
            }
          });
        }
        if (tx.paid_by_participant_id) {
          allParticipantIds.add(tx.paid_by_participant_id);
        }
      });

      // Fetch participant data for enrichment
      let participantMap = new Map<string, Participant>();
      
      if (allParticipantIds.size > 0) {
        const { data: participants, error: participantsError } = await supabase
          .from('participants')
          .select('id, group_id, user_id, email, type, role, full_name, avatar_url')
          .in('id', Array.from(allParticipantIds));

        if (!participantsError && participants) {
          participants.forEach((p: Participant) => {
            participantMap.set(p.id, p);
          });
        }
      }

      const parsedTransactions = (transactions || []).map((tx: TransactionWithSplits) => {
        // Enrich splits with participant data
        if (tx.transaction_splits) {
          tx.splits = tx.transaction_splits.map((split) => {
            const participant = split.participant_id ? participantMap.get(split.participant_id) : null;
            
            return {
              ...split,
              user_id: participant?.user_id || null,
              email: participant?.email || null,
              full_name: participant?.full_name || null,
              avatar_url: participant?.avatar_url || null,
            };
          });
          delete tx.transaction_splits;
        }

        // Populate split_among_participant_ids for the frontend
        if (tx.splits) {
          tx.split_among_participant_ids = tx.splits
            .map((s) => s.participant_id)
            .filter((id): id is string => !!id);
        }

        return tx;
      });

      return createSuccessResponse(parsedTransactions, 200, 0);
    }

    // Handle POST - Create new transaction
    if (httpMethod === 'POST') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = body ? JSON.parse(body) : {};
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!transactionData.amount || !transactionData.description || !transactionData.date || !transactionData.type) {
        return createErrorResponse(400, 'Missing required fields: amount, description, date, type', 'VALIDATION_ERROR');
      }

      const validation = validateTransactionData(transactionData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid transaction data', 'VALIDATION_ERROR');
      }

      if (transactionData.group_id) {
        const { data: membership, error: membershipError } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', transactionData.group_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (membershipError || !membership) {
          return createErrorResponse(403, 'You must be an active member of the group to add transactions', 'PERMISSION_DENIED');
        }
      }

      if (transactionData.group_id && transactionData.type === 'expense') {
        // Validate paid_by_participant_id
        if (transactionData.paid_by_participant_id) {
          const { data: participant, error: participantError } = await supabase
            .from('participants')
            .select('id, type')
            .eq('id', transactionData.paid_by_participant_id)
            .eq('group_id', transactionData.group_id)
            .single();

          if (participantError || !participant) {
            return createErrorResponse(400, 'paid_by_participant_id must be a valid participant in the group', 'VALIDATION_ERROR');
          }
        }

        // Validate split_among_participant_ids
        if (transactionData.split_among_participant_ids && Array.isArray(transactionData.split_among_participant_ids)) {
          const uniqueParticipantIds = [...new Set(transactionData.split_among_participant_ids)];
          if (uniqueParticipantIds.length > 0) {
            // Validate all participant_ids exist and belong to the group
            const { data: participants, error: participantsError } = await supabase
              .from('participants')
              .select('id')
              .eq('group_id', transactionData.group_id)
              .in('id', uniqueParticipantIds);

            if (participantsError) {
              return createErrorResponse(400, 'Failed to validate participants', 'VALIDATION_ERROR');
            }

            const foundParticipantIds = new Set((participants || []).map(p => p.id));
            const invalidParticipantIds = uniqueParticipantIds.filter(id => !foundParticipantIds.has(id));
            
            if (invalidParticipantIds.length > 0) {
              return createErrorResponse(400, `Invalid participant_ids: ${invalidParticipantIds.join(', ')}`, 'VALIDATION_ERROR');
            }
          }
        }
      }

      // Use split_among_participant_ids directly
      const participantIds = transactionData.split_among_participant_ids && Array.isArray(transactionData.split_among_participant_ids)
        ? [...new Set(transactionData.split_among_participant_ids)]
        : [];

      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          amount: transactionData.amount,
          description: transactionData.description,
          date: transactionData.date,
          type: transactionData.type,
          category: transactionData.category || null,
          group_id: transactionData.group_id || null,
          currency: transactionData.currency,
          paid_by_participant_id: transactionData.paid_by_participant_id || null,
        })
        .select()
        .single();

      if (error) {
        return handleError(error, 'creating transaction');
      }

      if (transaction && participantIds.length > 0) {
        const splits = calculateEqualSplits(transaction.amount, participantIds);
        splits.forEach(split => {
          split.transaction_id = transaction.id;
        });

        const splitValidation = validateSplitSum(splits, transaction.amount, transaction.currency || 'USD');
        if (!splitValidation.valid) {
          log.error('Split validation failed', 'transaction-creation', {
            transactionId: transaction.id,
            error: splitValidation.error,
            splits,
            amount: transaction.amount,
            currency: transaction.currency || 'USD',
          });
        }

        const { error: splitsError } = await supabase
          .from('transaction_splits')
          .insert(splits);

        if (splitsError) {
          log.error('Failed to create transaction_splits, rolling back transaction', 'transaction-creation', {
            transactionId: transaction.id,
            error: splitsError.message,
            code: splitsError.code,
          });

          const { error: rollbackError } = await supabase
            .from('transactions')
            .delete()
            .eq('id', transaction.id);

          if (rollbackError) {
            log.error('Failed to rollback transaction after split insert failure', 'transaction-creation', {
              transactionId: transaction.id,
              error: rollbackError.message,
              code: rollbackError.code,
            });
          }

          return createErrorResponse(500, 'Failed to create transaction splits', 'TRANSACTION_SPLIT_ERROR');
        }
      }

      let responseTransaction = transaction;
      try {
        const { data: transactionWithSplits, error: fetchError } = await supabase
          .from('transactions')
          .select(`
            *,
            transaction_splits (
              id,
              participant_id,
              amount,
              created_at
            )
          `)
          .eq('id', transaction.id)
          .single();

        if (!fetchError && transactionWithSplits) {
          responseTransaction = transactionWithSplits;
          if (responseTransaction.transaction_splits) {
            responseTransaction.splits = responseTransaction.transaction_splits;
            delete responseTransaction.transaction_splits;
          }
        }
      } catch (e) {
        log.warn('Could not fetch transaction with splits, using basic transaction', 'transaction-creation', {
          transactionId: transaction.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      if (responseTransaction && responseTransaction.split_among) {
        if (Array.isArray(responseTransaction.split_among)) {
          responseTransaction.split_among = [...new Set(responseTransaction.split_among)];
        } else {
          responseTransaction.split_among = [];
        }
      }

      return createSuccessResponse(responseTransaction, 201);
    }

    // Handle PUT - Update existing transaction
    if (httpMethod === 'PUT') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = body ? JSON.parse(body) : {};
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!transactionData.id) {
        return createErrorResponse(400, 'Missing transaction id', 'VALIDATION_ERROR');
      }

      const validation = validateTransactionData(transactionData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid transaction data', 'VALIDATION_ERROR');
      }

      const { data: existingTransaction, error: fetchError } = await supabase
        .from('transactions')
        .select('group_id, type, user_id, paid_by_participant_id')
        .eq('id', transactionData.id)
        .single();

      if (fetchError || !existingTransaction) {
        return createErrorResponse(404, 'Transaction not found', 'NOT_FOUND');
      }

      let canUpdate = existingTransaction.user_id === user.id;
      
      if (!canUpdate && existingTransaction.group_id) {
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', existingTransaction.group_id)
          .eq('user_id', user.id)
          .single();
        
        canUpdate = !memberError && !!groupMember;
      }

      if (!canUpdate) {
        return createErrorResponse(403, 'You can only update transactions you own or transactions in groups you belong to', 'PERMISSION_DENIED');
      }

      const groupId = transactionData.group_id !== undefined 
        ? transactionData.group_id 
        : existingTransaction.group_id;
      const transactionType = transactionData.type !== undefined 
        ? transactionData.type 
        : existingTransaction.type;

      // Validate participant_ids for expense transactions
      if (groupId && transactionType === 'expense') {
        if (transactionData.paid_by_participant_id !== undefined && transactionData.paid_by_participant_id) {
          const { data: participant, error: participantError } = await supabase
            .from('participants')
            .select('id')
            .eq('id', transactionData.paid_by_participant_id)
            .eq('group_id', groupId)
            .single();

          if (participantError || !participant) {
            return createErrorResponse(400, 'paid_by_participant_id must be a valid participant in the group', 'VALIDATION_ERROR');
          }
        }

        if (transactionData.split_among_participant_ids !== undefined && Array.isArray(transactionData.split_among_participant_ids)) {
          const uniqueParticipantIds = [...new Set(transactionData.split_among_participant_ids)];
          if (uniqueParticipantIds.length > 0) {
            const { data: participants, error: participantsError } = await supabase
              .from('participants')
              .select('id')
              .eq('group_id', groupId)
              .in('id', uniqueParticipantIds);

            if (participantsError) {
              return createErrorResponse(400, 'Failed to validate participants', 'VALIDATION_ERROR');
            }

            const foundParticipantIds = new Set((participants || []).map(p => p.id));
            const invalidParticipantIds = uniqueParticipantIds.filter(id => !foundParticipantIds.has(id));
            
            if (invalidParticipantIds.length > 0) {
              return createErrorResponse(400, `Invalid participant_ids: ${invalidParticipantIds.join(', ')}`, 'VALIDATION_ERROR');
            }
          }
        }
      }

      const updateData: Partial<Transaction> = {};
      if (transactionData.amount !== undefined) updateData.amount = transactionData.amount;
      if (transactionData.description !== undefined) updateData.description = transactionData.description;
      if (transactionData.date !== undefined) updateData.date = transactionData.date;
      if (transactionData.type !== undefined) updateData.type = transactionData.type;
      if (transactionData.category !== undefined) updateData.category = transactionData.category || undefined;
      if (transactionData.currency !== undefined) updateData.currency = transactionData.currency;
      if (transactionData.paid_by_participant_id !== undefined) updateData.paid_by_participant_id = transactionData.paid_by_participant_id || undefined;

      const { data: transaction, error } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', transactionData.id)
        .select()
        .single();

      if (error) {
        return handleError(error, 'updating transaction');
      }

      if (!transaction) {
        return createErrorResponse(404, 'Transaction not found', 'NOT_FOUND');
      }

      if (transactionData.split_among_participant_ids !== undefined) {
        await supabase
          .from('transaction_splits')
          .delete()
          .eq('transaction_id', transactionData.id);

        if (transactionData.split_among_participant_ids && Array.isArray(transactionData.split_among_participant_ids) && transactionData.split_among_participant_ids.length > 0) {
          const uniqueParticipantIds = [...new Set(transactionData.split_among_participant_ids)];
          const totalAmount = transaction.amount;
          const splits = calculateEqualSplits(totalAmount, uniqueParticipantIds);
          splits.forEach(split => {
            split.transaction_id = transaction.id;
          });

          const validation = validateSplitSum(splits, totalAmount, transaction.currency || transactionData.currency || 'USD');
          if (!validation.valid) {
            log.error('Split validation failed during update', 'transaction-update', {
              transactionId: transaction.id,
              error: validation.error,
              splits,
              amount: totalAmount,
              currency: transaction.currency || transactionData.currency || 'USD',
            });
          }

          const { error: splitsError } = await supabase
            .from('transaction_splits')
            .insert(splits);

          if (splitsError) {
            log.error('Failed to update transaction_splits', 'transaction-update', {
              transactionId: transaction.id,
              error: splitsError.message,
              code: splitsError.code,
            });
          }
        }
      } else if (transactionData.amount !== undefined) {
        // Recalculate splits when amount changes but participants don't
        const { data: existingSplits, error: splitsFetchError } = await supabase
          .from('transaction_splits')
          .select('participant_id')
          .eq('transaction_id', transactionData.id);

        if (!splitsFetchError && existingSplits && existingSplits.length > 0) {
          const newAmount = transactionData.amount;
          const participantIds = existingSplits.map(s => s.participant_id).filter((id): id is string => !!id);
          const newSplits = calculateEqualSplits(newAmount, participantIds);
          newSplits.forEach(split => {
            split.transaction_id = transaction.id;
          });

          const validation = validateSplitSum(newSplits, newAmount, transaction.currency || transactionData.currency || 'USD');
          if (!validation.valid) {
            log.error('Split validation failed during amount recalculation', 'transaction-update', {
              transactionId: transaction.id,
              error: validation.error,
              splits: newSplits,
              amount: newAmount,
              currency: transaction.currency || transactionData.currency || 'USD',
            });
          }

          await supabase
            .from('transaction_splits')
            .delete()
            .eq('transaction_id', transactionData.id);

            const { error: insertError } = await supabase
              .from('transaction_splits')
              .insert(newSplits);

            if (insertError) {
              log.error('Failed to insert recalculated splits', 'transaction-update', {
                transactionId: transaction.id,
                error: insertError.message,
                code: insertError.code,
              });
            }
        }
      }

      const { data: transactionWithSplits } = await supabase
        .from('transactions')
        .select(`
          *,
          transaction_splits (
            id,
            participant_id,
            amount,
            created_at
          )
        `)
        .eq('id', transaction.id)
        .single();

      const responseTransaction = transactionWithSplits || transaction;
      if (responseTransaction.transaction_splits) {
        responseTransaction.splits = responseTransaction.transaction_splits;
        delete responseTransaction.transaction_splits;
      }

      // Populate split_among_participant_ids from splits for backward compatibility in response
      if (responseTransaction.splits && Array.isArray(responseTransaction.splits)) {
        responseTransaction.split_among_participant_ids = responseTransaction.splits
          .map(s => s.participant_id)
          .filter((id): id is string => !!id);
      }

      return createSuccessResponse(responseTransaction, 200);
    }

    // Handle DELETE - Delete transaction
    if (httpMethod === 'DELETE') {
      const transactionId = url.searchParams.get('id');
      
      if (!transactionId) {
        return createErrorResponse(400, 'Missing transaction id in query parameters', 'VALIDATION_ERROR');
      }

      const id = parseInt(transactionId, 10);
      if (isNaN(id) || id <= 0) {
        return createErrorResponse(400, 'Invalid transaction id', 'VALIDATION_ERROR');
      }

      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('id, user_id, group_id')
        .eq('id', id)
        .single();

      if (fetchError || !transaction) {
        return createErrorResponse(404, 'Transaction not found', 'NOT_FOUND');
      }

      let canDelete = transaction.user_id === user.id;
      
      if (!canDelete && transaction.group_id) {
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', transaction.group_id)
          .eq('user_id', user.id)
          .single();
        
        canDelete = !memberError && !!groupMember;
      }

      if (!canDelete) {
        return createErrorResponse(403, 'Forbidden: You can only delete transactions you own or transactions in groups you belong to', 'PERMISSION_DENIED');
      }

      const { data: deletedData, error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .select();

      if (deleteError) {
        return handleError(deleteError, 'deleting transaction');
      }

      if (!deletedData || deletedData.length === 0) {
        return createErrorResponse(403, 'Transaction could not be deleted. You may not have permission.', 'PERMISSION_DENIED');
      }

      return createSuccessResponse({ success: true, message: 'Transaction deleted successfully' }, 200);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'transactions handler');
  }
});
