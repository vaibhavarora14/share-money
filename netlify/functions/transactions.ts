import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { AuthResult, verifyAuth } from '../utils/auth';
import { createErrorResponse, handleError } from '../utils/error-handler';
import { createEmptyResponse, createSuccessResponse } from '../utils/response';
import { isValidUUID, validateBodySize, validateTransactionData } from '../utils/validation';
import { formatCurrency } from './currency';

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
  paid_by?: string; // User ID of who paid for the expense
  split_among?: string[]; // Array of user IDs who the expense is split among
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
 * Ensures the sum of all splits equals the total amount by distributing
 * any rounding remainder to the first split.
 * 
 * @param totalAmount - The total amount to split
 * @param userIds - Array of user IDs to split among
 * @returns Array of split objects with user_id and amount
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

  // Calculate base amount per person (rounded down to 2 decimals)
  const baseAmount = Math.floor((totalAmount * 100) / splitCount) / 100;
  
  // Calculate what the sum would be with base amounts
  const baseSum = baseAmount * splitCount;
  
  // Calculate remainder (difference between total and base sum)
  // Round to handle floating point precision issues
  const remainder = Math.round((totalAmount - baseSum) * 100) / 100;

  // Create splits array
  const splits: TransactionSplit[] = uniqueUserIds.map((userId, index) => {
    // Add remainder to first split to ensure total matches
    const amount = index === 0
      ? Math.round((baseAmount + remainder) * 100) / 100
      : baseAmount;
    
    return {
      transaction_id: 0, // Will be set by caller
      user_id: userId,
      amount: amount,
    };
  });

  return splits;
}

/**
 * Validates that the sum of split amounts equals the transaction amount.
 * Allows a small tolerance (0.01) for floating point precision issues.
 * 
 * @param splits - Array of split amounts
 * @param transactionAmount - The total transaction amount
 * @returns Object with valid flag and optional error message
 */
function validateSplitSum(
  splits: Array<{ amount: number }>,
  transactionAmount: number,
  currencyCode: string = 'USD'
): { valid: boolean; error?: string } {
  const sum = splits.reduce((acc, split) => acc + split.amount, 0);
  const difference = Math.abs(sum - transactionAmount);
  const tolerance = 0.01; // Allow 1 cent tolerance for rounding

  if (difference > tolerance) {
    return {
      valid: false,
      error: `Split amounts sum (${formatCurrency(sum, currencyCode)}) does not equal transaction amount (${formatCurrency(transactionAmount, currencyCode)}). Difference: ${formatCurrency(difference, currencyCode)}`,
    };
  }

  return { valid: true };
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Validate request body size
    const bodySizeValidation = validateBodySize(event.body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Verify authentication
    let authResult: AuthResult;
    try {
      authResult = await verifyAuth(event);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabaseUrl, supabaseKey, authHeader } = authResult;

    // Create Supabase client for database queries
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

    const httpMethod = event.httpMethod;

    // Handle GET - Fetch transactions (optionally filtered by group_id)
    if (httpMethod === 'GET') {
      const groupId = event.queryStringParameters?.group_id;
      
      // Validate group_id format if provided
      if (groupId && !isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }
      
      // Try to fetch with transaction_splits joined, fallback to basic query if table doesn't exist
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

      // Filter by group_id if provided
      if (groupId) {
        query = query.eq('group_id', groupId);
      }

      let { data: transactions, error } = await query
        .order('date', { ascending: false })
        .limit(100);

      // If join fails (e.g., table doesn't exist yet), fallback to basic query
      if (error && (error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === '42P01')) {
        // Fallback: fetch without join
        let fallbackQuery = supabase
          .from('transactions')
          .select('*');
        
        if (groupId) {
          fallbackQuery = fallbackQuery.eq('group_id', groupId);
        }
        
        const fallbackResult = await fallbackQuery
          .order('date', { ascending: false })
          .limit(100);
        
        if (fallbackResult.error) {
          return handleError(fallbackResult.error, 'fetching transactions (fallback)');
        }
        
        transactions = fallbackResult.data;
        error = null;
      } else if (error) {
        return handleError(error, 'fetching transactions');
      }

      // Transform transactions to match frontend expectations
      const parsedTransactions = (transactions || []).map((tx: TransactionWithSplits) => {
        // Transform transaction_splits to splits
        if (tx.transaction_splits) {
          tx.splits = tx.transaction_splits;
          delete tx.transaction_splits;
        }

        // Ensure split_among is always an array for backward compatibility
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

        // If splits exist but split_among doesn't, derive split_among from splits for backward compatibility
        if (tx.splits && tx.splits.length > 0 && (!tx.split_among || tx.split_among.length === 0)) {
          tx.split_among = tx.splits.map((s) => s.user_id);
        }

        return tx;
      });

      return createSuccessResponse(parsedTransactions, 200, 0); // No caching - real-time data
    }

    // Handle POST - Create new transaction
    if (httpMethod === 'POST') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = JSON.parse(event.body || '{}');
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      // Validate required fields
      if (!transactionData.amount || !transactionData.description || !transactionData.date || !transactionData.type) {
        return createErrorResponse(400, 'Missing required fields: amount, description, date, type', 'VALIDATION_ERROR');
      }

      // Validate transaction data
      const validation = validateTransactionData(transactionData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid transaction data', 'VALIDATION_ERROR');
      }

      // If group_id is provided, verify user is a member of the group
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

      // Validate paid_by and split_among for group expenses
      // Note: Both group members and invited users (pending invitations) can be included.
      if (transactionData.group_id && transactionData.type === 'expense') {
        if (transactionData.paid_by) {
          // Verify that paid_by is a member of the group OR has a pending invitation
          const { data: paidByCheck, error: paidByError } = await supabase
            .rpc('is_user_member_or_invited', {
              check_group_id: transactionData.group_id,
              check_user_id: transactionData.paid_by
            });

          if (paidByError || !paidByCheck) {
            return createErrorResponse(400, 'paid_by must be a member of the group or have a pending invitation', 'VALIDATION_ERROR');
          }
        }

        if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
          // Remove duplicates before validation
          const uniqueSplitAmong = [...new Set(transactionData.split_among)];
          
          // Verify that all split_among users are members OR have pending invitations
          if (uniqueSplitAmong.length > 0) {
            // Check each user individually using the helper function
            const validationPromises = uniqueSplitAmong.map(async (userId) => {
              const { data: isValid, error } = await supabase
                .rpc('is_user_member_or_invited', {
                  check_group_id: transactionData.group_id,
                  check_user_id: userId
                });
              return { userId, isValid: isValid && !error };
            });

            const validationResults = await Promise.all(validationPromises);
            const invalidUserIds = validationResults
              .filter(result => !result.isValid)
              .map(result => result.userId);
            
            if (invalidUserIds.length > 0) {
              return createErrorResponse(400, 'All split_among users must be members of the group or have pending invitations', 'VALIDATION_ERROR');
            }
          }
        }
      }

      // Set user_id from authenticated user (RLS will also enforce this)
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
          // Supabase automatically handles JSONB conversion - no need to stringify
          split_among: transactionData.split_among && Array.isArray(transactionData.split_among)
            ? [...new Set(transactionData.split_among)] // Remove duplicates, pass array directly
            : null,
        })
        .select()
        .single();

      if (error) {
        return handleError(error, 'creating transaction');
      }

      // Create transaction_splits entries if split_among is provided (dual-write)
      // NOTE: This is a dual-write pattern. For true transaction rollback, we would need
      // a database function that handles both inserts atomically. For now, we rely on
      // split_among column as the source of truth if transaction_splits fails.
      if (transaction && transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
        // Calculate equal splits with proper rounding
        const splits = calculateEqualSplits(transaction.amount, transactionData.split_among);
        
        // Set transaction_id for all splits
        splits.forEach(split => {
          split.transaction_id = transaction.id;
        });

        // Validate that splits sum equals transaction amount
        const splitValidation = validateSplitSum(splits, transaction.amount, transaction.currency || 'USD');
        if (!splitValidation.valid) {
          // This should not happen with calculateEqualSplits, but log for debugging
          // Don't fail the transaction as split_among column has the data
        }

        // Insert splits into transaction_splits table
        const { error: splitsError } = await supabase
          .from('transaction_splits')
          .insert(splits);

        if (splitsError) {
          // If table doesn't exist, that's okay - split_among column has the data
          if (!(splitsError.message?.includes('relation') || splitsError.message?.includes('does not exist') || splitsError.code === '42P01')) {
            // For other errors, log but don't fail - transaction is already created
            // In production, consider implementing proper rollback via database function
          }
        } else {
          // Verify splits were created correctly
          const { data: createdSplits, error: verifyError } = await supabase
            .from('transaction_splits')
            .select('amount')
            .eq('transaction_id', transaction.id);

          if (!verifyError && createdSplits) {
            const verifyValidation = validateSplitSum(createdSplits, transaction.amount, transaction.currency || 'USD');
            if (!verifyValidation.valid) {
              // Log but don't fail - data integrity issue but transaction exists
            }
          }
        }
      }

      // Try to fetch transaction with splits populated, fallback to basic transaction if join fails
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
          // Transform splits to match frontend expectations
          if (responseTransaction.transaction_splits) {
            responseTransaction.splits = responseTransaction.transaction_splits;
            delete responseTransaction.transaction_splits;
          }
        }
      } catch (e) {
        // If join fails (table doesn't exist), just use the basic transaction
        console.warn('Could not fetch transaction with splits, using basic transaction:', e);
      }

      // Supabase automatically converts JSONB to JavaScript arrays
      // Just ensure it's an array and remove duplicates for data integrity
      if (responseTransaction && responseTransaction.split_among) {
        if (Array.isArray(responseTransaction.split_among)) {
          // Remove duplicates
          responseTransaction.split_among = [...new Set(responseTransaction.split_among)];
        } else {
          // Fallback: if somehow not an array (shouldn't happen), convert
          console.warn('split_among is not an array, converting:', responseTransaction.split_among);
          responseTransaction.split_among = [];
        }
      }

      return createSuccessResponse(responseTransaction, 201);
    }

    // Handle PUT - Update existing transaction
    if (httpMethod === 'PUT') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = JSON.parse(event.body || '{}');
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!transactionData.id) {
        return createErrorResponse(400, 'Missing transaction id', 'VALIDATION_ERROR');
      }

      // Validate transaction data
      const validation = validateTransactionData(transactionData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid transaction data', 'VALIDATION_ERROR');
      }

      // Get existing transaction to check group_id and verify permissions
      const { data: existingTransaction, error: fetchError } = await supabase
        .from('transactions')
        .select('group_id, type, user_id')
        .eq('id', transactionData.id)
        .single();

      if (fetchError || !existingTransaction) {
        return createErrorResponse(404, 'Transaction not found', 'NOT_FOUND');
      }

      // Verify user can update: any group member can update any transaction in their group
      // This allows all group members to modify any transaction, regardless of who created it
      let canUpdate = false;
      
      if (existingTransaction.group_id) {
        // Check if user is a group member - if so, they can update any transaction in the group
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', existingTransaction.group_id)
          .eq('user_id', user.id)
          .single();
        
        canUpdate = !memberError && !!groupMember;
      }
      
      // Also allow users to update their own transactions (even if not in a group)
      if (!canUpdate && existingTransaction.user_id === user.id) {
        canUpdate = true;
      }

      if (!canUpdate) {
        return createErrorResponse(403, 'You can only update transactions you own or transactions in groups you belong to', 'PERMISSION_DENIED');
      }

      // Determine if this is/will be a group expense
      const groupId = transactionData.group_id !== undefined 
        ? transactionData.group_id 
        : existingTransaction.group_id;
      const transactionType = transactionData.type !== undefined 
        ? transactionData.type 
        : existingTransaction.type;

      // Validate paid_by and split_among for group expenses
      // Note: Both group members and invited users (pending invitations) can be included.
      if (groupId && transactionType === 'expense') {
        // Validate paid_by if provided
        if (transactionData.paid_by !== undefined) {
          if (transactionData.paid_by) {
            // Verify that paid_by is a member of the group OR has a pending invitation
            const { data: paidByCheck, error: paidByError } = await supabase
              .rpc('is_user_member_or_invited', {
                check_group_id: groupId,
                check_user_id: transactionData.paid_by
              });

            if (paidByError || !paidByCheck) {
              return createErrorResponse(400, 'paid_by must be a member of the group or have a pending invitation', 'VALIDATION_ERROR');
            }
          }
        }

        // Validate split_among if provided
        if (transactionData.split_among !== undefined) {
          if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
            // Remove duplicates
            const uniqueSplitAmong = [...new Set(transactionData.split_among)];
            
            if (uniqueSplitAmong.length > 0) {
              // Verify that all split_among users are members OR have pending invitations
              const validationPromises = uniqueSplitAmong.map(async (userId) => {
                const { data: isValid, error } = await supabase
                  .rpc('is_user_member_or_invited', {
                    check_group_id: groupId,
                    check_user_id: userId
                  });
                return { userId, isValid: isValid && !error };
              });

              const validationResults = await Promise.all(validationPromises);
              const invalidUserIds = validationResults
                .filter(result => !result.isValid)
                .map(result => result.userId);
              
              if (invalidUserIds.length > 0) {
                return createErrorResponse(400, 'All split_among users must be members of the group or have pending invitations', 'VALIDATION_ERROR');
              }
            }
          }
        }
      }

      // Build update object (exclude id and user_id)
      const updateData: Partial<Transaction> = {};
      if (transactionData.amount !== undefined) updateData.amount = transactionData.amount;
      if (transactionData.description !== undefined) updateData.description = transactionData.description;
      if (transactionData.date !== undefined) updateData.date = transactionData.date;
      if (transactionData.type !== undefined) updateData.type = transactionData.type;
      if (transactionData.category !== undefined) updateData.category = transactionData.category || undefined;
      if (transactionData.currency !== undefined) updateData.currency = transactionData.currency;
      if (transactionData.paid_by !== undefined) updateData.paid_by = transactionData.paid_by || undefined;
      if (transactionData.split_among !== undefined) {
        // Remove duplicates before storing
        // Supabase automatically handles JSONB conversion - no need to stringify
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

      // Update transaction_splits if split_among was updated (dual-write)
      if (transactionData.split_among !== undefined) {
        // Delete existing splits
        const { error: deleteError } = await supabase
          .from('transaction_splits')
          .delete()
          .eq('transaction_id', transactionData.id);

        if (deleteError) {
          console.error('Failed to delete existing splits:', deleteError);
          // Continue anyway - will try to create new splits
        }

        // Create new splits if split_among is provided
        if (transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
          // Use the UPDATED transaction amount (from the update result)
          const totalAmount = transaction.amount;
          
          // Calculate equal splits with proper rounding
          const splits = calculateEqualSplits(totalAmount, transactionData.split_among);
          
          // Set transaction_id for all splits
          splits.forEach(split => {
            split.transaction_id = transaction.id;
          });

          // Validate that splits sum equals transaction amount
          const validation = validateSplitSum(splits, totalAmount, transaction.currency || transactionData.currency || 'USD');
          if (!validation.valid) {
            console.error('Split validation failed:', validation.error);
            // Log error but don't fail - transaction is already updated
          }

          const { error: splitsError } = await supabase
            .from('transaction_splits')
            .insert(splits);

          if (splitsError) {
            console.error('Failed to update transaction_splits:', splitsError);
            // Don't fail the transaction update, but log the error
          }
        }
      } else if (transactionData.amount !== undefined) {
        // If amount changed but split_among didn't, recalculate split amounts
        // Get existing splits and update their amounts
        const { data: existingSplits, error: splitsFetchError } = await supabase
          .from('transaction_splits')
          .select('user_id')
          .eq('transaction_id', transactionData.id);

        if (splitsFetchError) {
          console.error('Failed to fetch existing splits for recalculation:', splitsFetchError);
          // Don't fail the transaction update, but log the error
        } else if (existingSplits && existingSplits.length > 0) {
          // CRITICAL FIX: Use the NEW amount from transactionData, not the old transaction.amount
          const newAmount = transactionData.amount;
          
          // Calculate new split amounts with proper rounding
          const newSplits = calculateEqualSplits(newAmount, existingSplits.map(s => s.user_id));
          
          // Set transaction_id for all splits
          newSplits.forEach(split => {
            split.transaction_id = transaction.id;
          });

          // Validate that splits sum equals transaction amount
          const validation = validateSplitSum(newSplits, newAmount, transaction.currency || transactionData.currency || 'USD');
          if (!validation.valid) {
            console.error('Split validation failed:', validation.error);
            // Log error but continue
          }

          // Delete existing splits and recreate with new amounts
          // This is more efficient than individual updates and ensures consistency
          const { error: deleteError } = await supabase
            .from('transaction_splits')
            .delete()
            .eq('transaction_id', transactionData.id);

          if (deleteError) {
            console.error('Failed to delete existing splits for recalculation:', deleteError);
            // Don't fail, but log the error
          } else {
            // Insert new splits with updated amounts
            const { error: insertError } = await supabase
              .from('transaction_splits')
              .insert(newSplits);

            if (insertError) {
              console.error('Failed to insert recalculated splits:', insertError);
              // Don't fail the transaction update, but log the error
            } else {
              // Verify the update was successful
              const { data: updatedSplits, error: verifyError } = await supabase
                .from('transaction_splits')
                .select('amount')
                .eq('transaction_id', transactionData.id);

              if (!verifyError && updatedSplits) {
                const verifyValidation = validateSplitSum(updatedSplits, newAmount, transaction.currency || transactionData.currency || 'USD');
                if (!verifyValidation.valid) {
                  console.error('Split verification failed after amount update:', verifyValidation.error);
                }
              }
            }
          }
        }
      }

      // Fetch transaction with splits populated
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

      // Transform splits to match frontend expectations
      const responseTransaction = transactionWithSplits || transaction;
      if (responseTransaction.transaction_splits) {
        responseTransaction.splits = responseTransaction.transaction_splits;
        delete responseTransaction.transaction_splits;
      }

      // Supabase automatically converts JSONB to JavaScript arrays
      // Just ensure it's an array and remove duplicates for data integrity
      if (responseTransaction.split_among) {
        if (Array.isArray(responseTransaction.split_among)) {
          // Remove duplicates
          responseTransaction.split_among = [...new Set(responseTransaction.split_among)];
        } else {
          // Fallback: if somehow not an array (shouldn't happen), convert
          console.warn('split_among is not an array, converting:', responseTransaction.split_among);
          responseTransaction.split_among = [];
        }
      }

      return createSuccessResponse(responseTransaction, 200);
    }

    // Handle DELETE - Delete transaction
    if (httpMethod === 'DELETE') {
      const transactionId = event.queryStringParameters?.id;
      
      if (!transactionId) {
        return createErrorResponse(400, 'Missing transaction id in query parameters', 'VALIDATION_ERROR');
      }

      const id = parseInt(transactionId, 10);
      if (isNaN(id) || id <= 0) {
        return createErrorResponse(400, 'Invalid transaction id', 'VALIDATION_ERROR');
      }

      // First, verify the transaction exists
      const { data: transaction, error: fetchError } = await supabase
        .from('transactions')
        .select('id, user_id, group_id')
        .eq('id', id)
        .single();

      if (fetchError || !transaction) {
        return createErrorResponse(404, 'Transaction not found', 'NOT_FOUND');
      }

      // Verify user can delete: any group member can delete any transaction in their group
      // This allows all group members to delete any transaction, regardless of who created it
      let canDelete = false;
      
      if (transaction.group_id) {
        // Check if user is a group member - if so, they can delete any transaction in the group
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', transaction.group_id)
          .eq('user_id', user.id)
          .single();
        
        canDelete = !memberError && !!groupMember;
      }
      
      // Also allow users to delete their own transactions (even if not in a group)
      if (!canDelete && transaction.user_id === user.id) {
        canDelete = true;
      }

      if (!canDelete) {
        return createErrorResponse(403, 'Forbidden: You can only delete transactions you own or transactions in groups you belong to', 'PERMISSION_DENIED');
      }

      // Now delete the transaction (RLS will enforce permissions)
      const { data: deletedData, error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .select();

      if (deleteError) {
        return handleError(deleteError, 'deleting transaction');
      }

      // Verify deletion actually happened (Supabase delete can succeed with 0 rows due to RLS)
      if (!deletedData || deletedData.length === 0) {
        return createErrorResponse(403, 'Transaction could not be deleted. You may not have permission.', 'PERMISSION_DENIED');
      }

      return createSuccessResponse({ success: true, message: 'Transaction deleted successfully' }, 200);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'transactions handler');
  }
};

