import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidUUID, validateBodySize, validateTransactionData } from '../_shared/validation.ts';
import { formatCurrency } from '../_shared/currency.ts';
import { log } from '../_shared/logger.ts';

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
  paid_by?: string;
  split_among?: string[];
}

interface TransactionSplit {
  transaction_id: number;
  user_id: string;
  amount: number;
}

interface TransactionWithSplits extends Transaction {
  transaction_splits?: TransactionSplit[];
  splits?: TransactionSplit[];
}

/**
 * Calculates equal split amounts for a given total amount and user IDs.
 */
function calculateEqualSplits(
  totalAmount: number,
  userIds: string[]
): TransactionSplit[] {
  const uniqueUserIds = [...new Set(userIds)];
  const splitCount = uniqueUserIds.length;

  if (splitCount === 0) {
    return [];
  }

  const baseAmount = Math.floor((totalAmount * 100) / splitCount) / 100;
  const baseSum = baseAmount * splitCount;
  const remainder = Math.round((totalAmount - baseSum) * 100) / 100;

  const splits: TransactionSplit[] = uniqueUserIds.map((userId, index) => {
    const amount = index === 0
      ? Math.round((baseAmount + remainder) * 100) / 100
      : baseAmount;
    
    return {
      transaction_id: 0,
      user_id: userId,
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
            user_id,
            amount,
            created_at
          )
        `);

      if (groupId) {
        query = query.eq('group_id', groupId);
      }

      let { data: transactions, error } = await query
        .order('date', { ascending: false })
        .limit(100);

      if (error && (error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === '42P01')) {
        let fallbackQuery = supabase.from('transactions').select('id, amount, description, date, type, category, user_id, group_id, currency, paid_by, split_among, created_at, updated_at');
        if (groupId) {
          fallbackQuery = fallbackQuery.eq('group_id', groupId);
        }
        const fallbackResult = await fallbackQuery.order('date', { ascending: false }).limit(100);
        if (fallbackResult.error) {
          return handleError(fallbackResult.error, 'fetching transactions (fallback)');
        }
        transactions = fallbackResult.data;
        error = null;
      } else if (error) {
        return handleError(error, 'fetching transactions');
      }

      const parsedTransactions = (transactions || []).map((tx: TransactionWithSplits) => {
        if (tx.transaction_splits) {
          tx.splits = tx.transaction_splits;
          delete tx.transaction_splits;
        }

        if (tx.split_among && !Array.isArray(tx.split_among)) {
          try {
            const parsed = typeof tx.split_among === 'string' 
              ? JSON.parse(tx.split_among)
              : tx.split_among;
            tx.split_among = Array.isArray(parsed) ? parsed : [];
          } catch {
            tx.split_among = [];
          }
        } else if (!tx.split_among) {
          tx.split_among = [];
        }

        if (tx.splits && tx.splits.length > 0 && (!tx.split_among || tx.split_among.length === 0)) {
          tx.split_among = tx.splits.map((s) => s.user_id);
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
          .single();

        if (membershipError || !membership) {
          return createErrorResponse(403, 'You must be a member of the group to add transactions', 'PERMISSION_DENIED');
        }
      }

      if (transactionData.group_id && transactionData.type === 'expense') {
        if (transactionData.paid_by) {
          const { data: paidByMember, error: paidByError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', transactionData.group_id)
            .eq('user_id', transactionData.paid_by)
            .single();

          if (paidByError || !paidByMember) {
            return createErrorResponse(400, 'paid_by must be a member of the group', 'VALIDATION_ERROR');
          }
        }

        if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
          const uniqueSplitAmong = [...new Set(transactionData.split_among)];
          if (uniqueSplitAmong.length > 0) {
            const { data: splitMembers, error: splitError } = await supabase
              .from('group_members')
              .select('user_id')
              .eq('group_id', transactionData.group_id)
              .in('user_id', uniqueSplitAmong);

            if (splitError) {
              return handleError(splitError, 'validating split_among members');
            }

            const validUserIds = splitMembers?.map(m => m.user_id) || [];
            const invalidUserIds = uniqueSplitAmong.filter(id => !validUserIds.includes(id));
            
            if (invalidUserIds.length > 0) {
              return createErrorResponse(400, 'All split_among users must be members of the group', 'VALIDATION_ERROR');
            }
          }
        }
      }

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
          paid_by: transactionData.paid_by || null,
          split_among: transactionData.split_among && Array.isArray(transactionData.split_among)
            ? [...new Set(transactionData.split_among)]
            : null,
        })
        .select()
        .single();

      if (error) {
        return handleError(error, 'creating transaction');
      }

      if (transaction && transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
        const splits = calculateEqualSplits(transaction.amount, transactionData.split_among);
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
          // Note: Transaction is already created, split_among column has the data
          // Consider monitoring/alerting for data integrity issues
        }

        const { error: splitsError } = await supabase
          .from('transaction_splits')
          .insert(splits);

        if (splitsError) {
          // If table doesn't exist, that's okay - split_among column has the data
          if (splitsError.message?.includes('relation') || splitsError.message?.includes('does not exist') || splitsError.code === '42P01') {
            log.warn('transaction_splits table does not exist, using split_among column', 'transaction-creation', {
              transactionId: transaction.id,
            });
          } else {
            log.error('Failed to create transaction_splits', 'transaction-creation', {
              transactionId: transaction.id,
              error: splitsError.message,
              code: splitsError.code,
            });
            // Transaction is already created, but splits weren't saved
            // Consider monitoring/alerting for data consistency issues
          }
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
              user_id,
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
        .select('group_id, type, user_id')
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

      if (groupId && transactionType === 'expense') {
        if (transactionData.paid_by !== undefined) {
          if (transactionData.paid_by) {
            const { data: paidByMember, error: paidByError } = await supabase
              .from('group_members')
              .select('id')
              .eq('group_id', groupId)
              .eq('user_id', transactionData.paid_by)
              .single();

            if (paidByError || !paidByMember) {
              return createErrorResponse(400, 'paid_by must be a member of the group', 'VALIDATION_ERROR');
            }
          }
        }

        if (transactionData.split_among !== undefined) {
          if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
            const uniqueSplitAmong = [...new Set(transactionData.split_among)];
            if (uniqueSplitAmong.length > 0) {
              const { data: splitMembers, error: splitError } = await supabase
                .from('group_members')
                .select('user_id')
                .eq('group_id', groupId)
                .in('user_id', uniqueSplitAmong);

              if (splitError) {
                return handleError(splitError, 'validating split_among members');
              }

              const validUserIds = splitMembers?.map(m => m.user_id) || [];
              const invalidUserIds = uniqueSplitAmong.filter(id => !validUserIds.includes(id));
              
              if (invalidUserIds.length > 0) {
                return createErrorResponse(400, 'All split_among users must be members of the group', 'VALIDATION_ERROR');
              }
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
      if (transactionData.paid_by !== undefined) updateData.paid_by = transactionData.paid_by || undefined;
      if (transactionData.split_among !== undefined) {
        const uniqueSplitAmong = transactionData.split_among && Array.isArray(transactionData.split_among)
          ? [...new Set(transactionData.split_among)]
          : transactionData.split_among;
        updateData.split_among = uniqueSplitAmong || null;
      }

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

      if (transactionData.split_among !== undefined) {
        await supabase
          .from('transaction_splits')
          .delete()
          .eq('transaction_id', transactionData.id);

        if (transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
          const totalAmount = transaction.amount;
          const splits = calculateEqualSplits(totalAmount, transactionData.split_among);
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
        const { data: existingSplits, error: splitsFetchError } = await supabase
          .from('transaction_splits')
          .select('user_id')
          .eq('transaction_id', transactionData.id);

        if (!splitsFetchError && existingSplits && existingSplits.length > 0) {
          const newAmount = transactionData.amount;
          const newSplits = calculateEqualSplits(newAmount, existingSplits.map(s => s.user_id));
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
            user_id,
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

      if (responseTransaction.split_among) {
        if (Array.isArray(responseTransaction.split_among)) {
          responseTransaction.split_among = [...new Set(responseTransaction.split_among)];
        } else {
          responseTransaction.split_among = [];
        }
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
