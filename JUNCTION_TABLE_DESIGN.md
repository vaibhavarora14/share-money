# Junction Table Design for Expense Splits

## Database Schema

### New Table: `transaction_splits`

```sql
-- Migration: Create transaction_splits table
CREATE TABLE IF NOT EXISTS transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL, -- Individual split amount (for unequal splits)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id 
  ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_user_id 
  ON transaction_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_composite 
  ON transaction_splits(transaction_id, user_id);

-- Enable RLS
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view splits for their transactions"
  ON transaction_splits
  FOR SELECT
  USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE user_id = auth.uid()
      OR (group_id IS NOT NULL AND group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can create splits for their transactions"
  ON transaction_splits
  FOR INSERT
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update splits for their transactions"
  ON transaction_splits
  FOR UPDATE
  USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete splits for their transactions"
  ON transaction_splits
  FOR DELETE
  USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE transaction_splits IS 'Stores how expenses are split among users';
COMMENT ON COLUMN transaction_splits.amount IS 'Individual amount this user owes (for unequal splits)';
```

### Updated Transactions Table

```sql
-- Remove split_among column (after migration)
-- ALTER TABLE transactions DROP COLUMN split_among;

-- Keep paid_by (still needed)
-- paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

## TypeScript Types

```typescript
// types.ts

export interface TransactionSplit {
  id: string;
  transaction_id: number;
  user_id: string;
  amount: number; // Individual split amount
  created_at?: string;
  email?: string; // Populated from join
}

export interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category?: string;
  created_at?: string;
  user_id?: string;
  group_id?: string;
  currency?: string;
  paid_by?: string;
  // Removed: split_among?: string[];
  splits?: TransactionSplit[]; // Populated from join
}

export interface TransactionWithSplits extends Transaction {
  splits: TransactionSplit[];
}
```

---

## API Implementation

### GET Transactions (with splits)

```typescript
// netlify/functions/transactions.ts

if (httpMethod === 'GET') {
  const groupId = event.queryStringParameters?.group_id;
  
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

  const { data: transactions, error } = await query
    .order('date', { ascending: false })
    .limit(100);

  if (error) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch transactions', details: error.message }),
    };
  }

  // Transform splits array to match frontend expectations
  const transactionsWithSplits = (transactions || []).map(tx => ({
    ...tx,
    splits: tx.transaction_splits || [],
    // For backward compatibility, can derive split_among from splits
    split_among: (tx.transaction_splits || []).map(s => s.user_id)
  }));

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(transactionsWithSplits),
  };
}
```

### POST Transaction (with splits)

```typescript
if (httpMethod === 'POST') {
  // ... validation code ...

  // Create transaction first
  const { data: transaction, error: txError } = await supabase
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
    })
    .select()
    .single();

  if (txError || !transaction) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to create transaction', details: txError?.message }),
    };
  }

  // Create splits if provided (for group expenses)
  if (transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
    const totalAmount = transactionData.amount;
    const splitCount = transactionData.split_among.length;
    const splitAmount = totalAmount / splitCount; // Equal split (can be customized later)

    const splits = transactionData.split_among.map(userId => ({
      transaction_id: transaction.id,
      user_id: userId,
      amount: splitAmount,
    }));

    const { error: splitsError } = await supabase
      .from('transaction_splits')
      .insert(splits);

    if (splitsError) {
      // Rollback transaction if splits fail
      await supabase.from('transactions').delete().eq('id', transaction.id);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to create splits', details: splitsError.message }),
      };
    }
  }

  // Fetch transaction with splits
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

  return {
    statusCode: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(transactionWithSplits),
  };
}
```

### PUT Transaction (update splits)

```typescript
if (httpMethod === 'PUT') {
  // ... validation and ownership checks ...

  // Update transaction fields
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', transactionData.id)
    .select()
    .single();

  if (txError || !transaction) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update transaction', details: txError?.message }),
    };
  }

  // Update splits if provided
  if (transactionData.split_among !== undefined) {
    // Delete existing splits
    await supabase
      .from('transaction_splits')
      .delete()
      .eq('transaction_id', transactionData.id);

    // Insert new splits
    if (transactionData.split_among && Array.isArray(transactionData.split_among) && transactionData.split_among.length > 0) {
      const totalAmount = transaction.amount;
      const splitCount = transactionData.split_among.length;
      const splitAmount = totalAmount / splitCount;

      const splits = transactionData.split_among.map(userId => ({
        transaction_id: transaction.id,
        user_id: userId,
        amount: splitAmount,
      }));

      await supabase
        .from('transaction_splits')
        .insert(splits);
    }
  }

  // Fetch updated transaction with splits
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

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(transactionWithSplits),
  };
}
```

---

## Frontend Changes

### Updated Transaction Type

```typescript
// mobile/types.ts
export interface Transaction {
  id: number;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category?: string;
  created_at?: string;
  user_id?: string;
  group_id?: string;
  currency?: string;
  paid_by?: string;
  splits?: TransactionSplit[]; // New: from junction table
  // Keep for backward compatibility during migration
  split_among?: string[];
}

export interface TransactionSplit {
  id: string;
  transaction_id: number;
  user_id: string;
  amount: number;
  created_at?: string;
  email?: string; // Populated from API
}
```

### TransactionFormScreen Updates

```typescript
// mobile/screens/TransactionFormScreen.tsx

// State remains similar, but we work with user IDs
const [splitAmong, setSplitAmong] = useState<string[]>([]);

// When loading transaction
useEffect(() => {
  if (transaction) {
    // Extract user IDs from splits array
    const userIds = transaction.splits?.map(s => s.user_id) || 
                    transaction.split_among || []; // Fallback for old data
    setSplitAmong(userIds);
  }
}, [transaction]);

// When saving
const handleSave = async () => {
  // ... validation ...

  await onSave({
    // ... other fields ...
    split_among: isGroupExpense ? splitAmong : undefined,
    // API will create splits from this array
  });
};
```

### Displaying Split Information

```typescript
// mobile/components/TransactionsSection.tsx

{transaction.splits && transaction.splits.length > 0 && (
  <View>
    <Text variant="bodySmall">Split among {transaction.splits.length} people:</Text>
    {transaction.splits.map(split => (
      <Text key={split.id} variant="bodySmall">
        {split.email}: {formatCurrency(split.amount, transaction.currency)}
      </Text>
    ))}
  </View>
)}
```

---

## Useful Queries

### Find All Expenses User Is Part Of

```sql
SELECT DISTINCT t.*
FROM transactions t
JOIN transaction_splits ts ON t.id = ts.transaction_id
WHERE ts.user_id = 'user-uuid'
ORDER BY t.date DESC;
```

### Calculate Who Owes What

```sql
SELECT 
  t.id,
  t.description,
  t.amount as total_amount,
  u_paid.email as paid_by_email,
  u_owes.email as owes_email,
  ts.amount as owes_amount,
  CASE 
    WHEN t.paid_by = ts.user_id THEN 0
    ELSE ts.amount
  END as net_amount
FROM transactions t
JOIN transaction_splits ts ON t.id = ts.transaction_id
LEFT JOIN auth.users u_paid ON t.paid_by = u_paid.id
LEFT JOIN auth.users u_owes ON ts.user_id = u_owes.id
WHERE t.group_id = 'group-uuid'
ORDER BY t.date DESC;
```

### Calculate Balances Between Users

```sql
WITH balances AS (
  SELECT 
    t.paid_by as from_user,
    ts.user_id as to_user,
    ts.amount as amount
  FROM transactions t
  JOIN transaction_splits ts ON t.id = ts.transaction_id
  WHERE t.paid_by != ts.user_id
    AND t.group_id = 'group-uuid'
)
SELECT 
  from_user,
  to_user,
  SUM(amount) as total_owed
FROM balances
GROUP BY from_user, to_user
ORDER BY total_owed DESC;
```

### Validate Split Amounts Match Transaction

```sql
SELECT 
  t.id,
  t.amount as transaction_amount,
  COALESCE(SUM(ts.amount), 0) as split_total,
  t.amount - COALESCE(SUM(ts.amount), 0) as difference
FROM transactions t
LEFT JOIN transaction_splits ts ON t.id = ts.transaction_id
WHERE t.group_id = 'group-uuid'
GROUP BY t.id, t.amount
HAVING ABS(t.amount - COALESCE(SUM(ts.amount), 0)) > 0.01; -- Find mismatches
```

---

## Migration Strategy

### Step 1: Create New Table (Non-Breaking)

```sql
-- Create transaction_splits table (as shown above)
-- This doesn't break existing code
```

### Step 2: Dual-Write Period

```typescript
// API writes to both old and new structure
// Create splits in transaction_splits
// Also keep split_among for backward compatibility
```

### Step 3: Backfill Existing Data

```sql
-- Migrate existing split_among data to transaction_splits
INSERT INTO transaction_splits (transaction_id, user_id, amount)
SELECT 
  t.id,
  jsonb_array_elements_text(t.split_among)::UUID as user_id,
  t.amount / NULLIF(jsonb_array_length(t.split_among), 0) as amount
FROM transactions t
WHERE t.split_among IS NOT NULL 
  AND jsonb_array_length(t.split_among) > 0
  AND NOT EXISTS (
    SELECT 1 FROM transaction_splits ts 
    WHERE ts.transaction_id = t.id
  );
```

### Step 4: Update Frontend (Read from Splits)

```typescript
// Frontend reads from splits, falls back to split_among
const userIds = transaction.splits?.map(s => s.user_id) || 
                transaction.split_among || [];
```

### Step 5: Remove Old Column

```sql
-- After all clients updated
ALTER TABLE transactions DROP COLUMN split_among;
```

---

## Benefits of This Approach

1. **Unequal Splits:** Easy to implement - just set different `amount` values
2. **Payment Tracking:** Can add `is_paid`, `paid_at` columns later
3. **Better Queries:** Standard SQL JOINs instead of JSONB operations
4. **Type Safety:** Foreign keys ensure data integrity
5. **Scalability:** Better performance for large datasets
6. **Reporting:** Easy to generate balance sheets, who-owes-what reports

---

## Future Enhancements

### Add Payment Tracking

```sql
ALTER TABLE transaction_splits
ADD COLUMN is_paid BOOLEAN DEFAULT FALSE,
ADD COLUMN paid_at TIMESTAMP,
ADD COLUMN payment_method VARCHAR(50);
```

### Add Split Notes

```sql
ALTER TABLE transaction_splits
ADD COLUMN notes TEXT;
```

### Support Custom Split Percentages

```sql
ALTER TABLE transaction_splits
ADD COLUMN percentage DECIMAL(5, 2); -- e.g., 25.50 for 25.5%
```

---

## Code Complexity Comparison

**Current (JSONB Array):**
- Insert: 1 query
- Read: 1 query (with JSON parsing)
- Update: 1 query (with JSON manipulation)
- Query "who owes": Complex JSONB queries

**Junction Table:**
- Insert: 2 queries (transaction + splits) or 1 with transaction
- Read: 1 query (with JOIN)
- Update: 2-3 queries (transaction + delete splits + insert splits)
- Query "who owes": Simple JOIN queries

**Trade-off:** Slightly more complex writes, much simpler reads and reporting.
