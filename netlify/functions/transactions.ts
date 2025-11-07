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
      
      let query = supabase
        .from('transactions')
        .select('*');

      // Filter by group_id if provided
      if (groupId) {
        query = query.eq('group_id', groupId);
      }

      const { data: transactions, error } = await query
        .order('date', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch transactions', details: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(transactions || []),
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
          currency: transactionData.currency || 'USD',
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

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
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

      // Build update object (exclude id and user_id)
      const updateData: any = {};
      if (transactionData.amount !== undefined) updateData.amount = transactionData.amount;
      if (transactionData.description !== undefined) updateData.description = transactionData.description;
      if (transactionData.date !== undefined) updateData.date = transactionData.date;
      if (transactionData.type !== undefined) updateData.type = transactionData.type;
      if (transactionData.category !== undefined) updateData.category = transactionData.category || null;
      if (transactionData.currency !== undefined) updateData.currency = transactionData.currency || 'USD';

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

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
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

