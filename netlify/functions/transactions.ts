import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

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
  transactionAmount: number
): { valid: boolean; error?: string } {
  const sum = splits.reduce((acc, split) => acc + split.amount, 0);
  const difference = Math.abs(sum - transactionAmount);
  const tolerance = 0.01; // Allow 1 cent tolerance for rounding

  if (difference > tolerance) {
    return {
      valid: false,
      error: `Split amounts sum (${sum.toFixed(2)}) does not equal transaction amount (${transactionAmount.toFixed(2)}). Difference: ${difference.toFixed(2)}`,
    };
  }

  return { valid: true };
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Get Supabase credentials from environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Supabase credentials' }),
      };
    }

    // Get authorization header - Netlify Functions headers are lowercase
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

    // Verify the user by calling Supabase REST API directly
    // This is more reliable for serverless functions
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

    const user = await userResponse.json();
    
    if (!user || !user.id) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid user data'
        }),
      };
    }

    // Create Supabase client for database queries
    // Use the Authorization header in global headers for RLS
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
        console.warn('transaction_splits table may not exist, falling back to basic query:', error.message);
        
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
          console.error('Supabase error (fallback):', fallbackResult.error);
          return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to fetch transactions', details: fallbackResult.error.message }),
          };
        }
        
        transactions = fallbackResult.data;
        error = null;
      } else if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch transactions', details: error.message }),
        };
      }

      // Transform transactions to match frontend expectations
      const parsedTransactions = (transactions || []).map((tx: any) => {
        // Transform transaction_splits to splits
        if (tx.transaction_splits) {
          tx.splits = tx.transaction_splits;
          delete tx.transaction_splits;
        }

        // Ensure split_among is always an array for backward compatibility
        if (tx.split_among && !Array.isArray(tx.split_among)) {
          // Fallback: if somehow not an array, convert to array
          // This shouldn't happen with proper JSONB handling, but safety first
          try {
            const parsed = typeof tx.split_among === 'string' 
              ? JSON.parse(tx.split_among)
              : tx.split_among;
            tx.split_among = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            tx.split_among = [];
          }
        } else if (!tx.split_among) {
          tx.split_among = [];
        }

        // If splits exist but split_among doesn't, derive split_among from splits for backward compatibility
        if (tx.splits && tx.splits.length > 0 && (!tx.split_among || tx.split_among.length === 0)) {
          tx.split_among = tx.splits.map((s: any) => s.user_id);
        }

        return tx;
      });

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedTransactions),
      };
    }

    // Handle POST - Create new transaction
    if (httpMethod === 'POST') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }

      // Validate required fields
      if (!transactionData.amount || !transactionData.description || !transactionData.date || !transactionData.type) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required fields: amount, description, date, type' }),
        };
      }

      // Validate type
      if (transactionData.type !== 'income' && transactionData.type !== 'expense') {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Type must be either "income" or "expense"' }),
        };
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
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'You must be a member of the group to add transactions' }),
          };
        }
      }

      // Validate paid_by and split_among for group expenses
      // Note: Only actual group members (from group_members table) can be included.
      // Pending invitations are excluded because they haven't accepted yet.
      if (transactionData.group_id && transactionData.type === 'expense') {
        if (transactionData.paid_by) {
          // Verify that paid_by is a member of the group (not just invited)
          const { data: paidByMember, error: paidByError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', transactionData.group_id)
            .eq('user_id', transactionData.paid_by)
            .single();

          if (paidByError || !paidByMember) {
            return {
              statusCode: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'paid_by must be a member of the group' }),
            };
          }
        }

        if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
          // Remove duplicates before validation
          const uniqueSplitAmong = [...new Set(transactionData.split_among)];
          
          // Verify that all split_among users are actual members of the group
          // (not just pending invitations - they must have accepted and joined)
          if (uniqueSplitAmong.length > 0) {
            const { data: splitMembers, error: splitError } = await supabase
              .from('group_members')
              .select('user_id')
              .eq('group_id', transactionData.group_id)
              .in('user_id', uniqueSplitAmong);

            if (splitError) {
              return {
                statusCode: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to validate split_among members', details: splitError.message }),
              };
            }

            const validUserIds = splitMembers?.map(m => m.user_id) || [];
            const invalidUserIds = uniqueSplitAmong.filter(id => !validUserIds.includes(id));
            
            if (invalidUserIds.length > 0) {
              return {
                statusCode: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'All split_among users must be members of the group' }),
              };
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
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to create transaction', details: error.message }),
        };
      }

      // Create transaction_splits entries if split_among is provided (dual-write)
      if (transaction && transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
        // Calculate equal splits with proper rounding
        const splits = calculateEqualSplits(transaction.amount, transactionData.split_among);
        
        // Set transaction_id for all splits
        splits.forEach(split => {
          split.transaction_id = transaction.id;
        });

        // Validate that splits sum equals transaction amount
        const validation = validateSplitSum(splits, transaction.amount);
        if (!validation.valid) {
          console.error('Split validation failed:', validation.error);
          // Log error but don't fail - transaction is already created
          // This should not happen with calculateEqualSplits, but safety check
        }

        // Insert splits into transaction_splits table
        // If table doesn't exist yet, this will fail silently (transaction still created with split_among)
        const { error: splitsError } = await supabase
          .from('transaction_splits')
          .insert(splits);

        if (splitsError) {
          // Log but don't fail - table might not exist yet, split_among column has the data
          if (splitsError.message?.includes('relation') || splitsError.message?.includes('does not exist') || splitsError.code === '42P01') {
            console.warn('transaction_splits table may not exist yet, skipping split creation:', splitsError.message);
          } else {
            console.error('Failed to create transaction_splits:', splitsError);
          }
          // Transaction is still created successfully with split_among for backward compatibility
        } else {
          // Verify splits were created correctly (optional validation)
          const { data: createdSplits, error: verifyError } = await supabase
            .from('transaction_splits')
            .select('amount')
            .eq('transaction_id', transaction.id);

          if (!verifyError && createdSplits) {
            const verifyValidation = validateSplitSum(createdSplits, transaction.amount);
            if (!verifyValidation.valid) {
              console.error('Split verification failed after insert:', verifyValidation.error);
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

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(responseTransaction),
      };
    }

    // Handle PUT - Update existing transaction
    if (httpMethod === 'PUT') {
      let transactionData: Partial<Transaction>;
      try {
        transactionData = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }

      if (!transactionData.id) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing transaction id' }),
        };
      }

      // Validate type if provided
      if (transactionData.type && transactionData.type !== 'income' && transactionData.type !== 'expense') {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Type must be either "income" or "expense"' }),
        };
      }

      // Get existing transaction to check group_id and verify ownership
      const { data: existingTransaction, error: fetchError } = await supabase
        .from('transactions')
        .select('group_id, type, user_id')
        .eq('id', transactionData.id)
        .single();

      if (fetchError || !existingTransaction) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Transaction not found' }),
        };
      }

      // Verify user owns the transaction
      if (existingTransaction.user_id !== user.id) {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'You can only update your own transactions' }),
        };
      }

      // Determine if this is/will be a group expense
      const groupId = transactionData.group_id !== undefined 
        ? transactionData.group_id 
        : existingTransaction.group_id;
      const transactionType = transactionData.type !== undefined 
        ? transactionData.type 
        : existingTransaction.type;

      // Validate paid_by and split_among for group expenses
      // Note: Only actual group members (from group_members table) can be included.
      // Pending invitations are excluded because they haven't accepted yet.
      if (groupId && transactionType === 'expense') {
        // Validate paid_by if provided
        if (transactionData.paid_by !== undefined) {
          if (transactionData.paid_by) {
            // Verify that paid_by is a member of the group (not just invited)
            const { data: paidByMember, error: paidByError } = await supabase
              .from('group_members')
              .select('id')
              .eq('group_id', groupId)
              .eq('user_id', transactionData.paid_by)
              .single();

            if (paidByError || !paidByMember) {
              return {
                statusCode: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'paid_by must be a member of the group' }),
              };
            }
          }
        }

        // Validate split_among if provided
        if (transactionData.split_among !== undefined) {
          if (transactionData.split_among && Array.isArray(transactionData.split_among)) {
            // Remove duplicates
            const uniqueSplitAmong = [...new Set(transactionData.split_among)];
            
            if (uniqueSplitAmong.length > 0) {
              // Verify that all split_among users are actual members of the group
              // (not just pending invitations - they must have accepted and joined)
              const { data: splitMembers, error: splitError } = await supabase
                .from('group_members')
                .select('user_id')
                .eq('group_id', groupId)
                .in('user_id', uniqueSplitAmong);

              if (splitError) {
                return {
                  statusCode: 500,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ error: 'Failed to validate split_among members', details: splitError.message }),
                };
              }

              const validUserIds = splitMembers?.map(m => m.user_id) || [];
              const invalidUserIds = uniqueSplitAmong.filter(id => !validUserIds.includes(id));
              
              if (invalidUserIds.length > 0) {
                return {
                  statusCode: 400,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ error: 'All split_among users must be members of the group' }),
                };
              }
            }
          }
        }
      }

      // Build update object (exclude id and user_id)
      const updateData: any = {};
      if (transactionData.amount !== undefined) updateData.amount = transactionData.amount;
      if (transactionData.description !== undefined) updateData.description = transactionData.description;
      if (transactionData.date !== undefined) updateData.date = transactionData.date;
      if (transactionData.type !== undefined) updateData.type = transactionData.type;
      if (transactionData.category !== undefined) updateData.category = transactionData.category || null;
      if (transactionData.currency !== undefined) updateData.currency = transactionData.currency;
      if (transactionData.paid_by !== undefined) updateData.paid_by = transactionData.paid_by || null;
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
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to update transaction', details: error.message }),
        };
      }

      if (!transaction) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Transaction not found' }),
        };
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
          const validation = validateSplitSum(splits, totalAmount);
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
          const validation = validateSplitSum(newSplits, newAmount);
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
                const verifyValidation = validateSplitSum(updatedSplits, newAmount);
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

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(responseTransaction),
      };
    }

    // Handle DELETE - Delete transaction
    if (httpMethod === 'DELETE') {
      // Get transaction ID from query string
      const transactionId = event.queryStringParameters?.id;
      
      if (!transactionId) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing transaction id in query parameters' }),
        };
      }

      const id = parseInt(transactionId, 10);
      if (isNaN(id)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid transaction id' }),
        };
      }

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to delete transaction', details: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Transaction deleted successfully' }),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: error.message }),
    };
  }
};

