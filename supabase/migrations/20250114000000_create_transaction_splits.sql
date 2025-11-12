-- Create transaction_splits table for expense splitting
-- Created: 2025-01-14
--
-- This migration creates the transaction_splits junction table to support:
-- - Equal splits (current implementation)
-- - Unequal splits (future feature)
-- - Group balance calculations (future feature)
--
-- This is a non-breaking change - split_among column remains for backward compatibility
-- Also includes backfill of existing split_among data

-- ============================================================================
-- CREATE TRANSACTION_SPLITS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
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

-- Enable Row Level Security
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Users can view splits for transactions they have access to
CREATE POLICY "Users can view splits for accessible transactions"
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

-- Users can create splits for their own transactions
CREATE POLICY "Users can create splits for their transactions"
  ON transaction_splits
  FOR INSERT
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- Users can update splits for their own transactions
CREATE POLICY "Users can update splits for their transactions"
  ON transaction_splits
  FOR UPDATE
  USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- Users can delete splits for their own transactions
CREATE POLICY "Users can delete splits for their transactions"
  ON transaction_splits
  FOR DELETE
  USING (
    transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE transaction_splits IS 'Stores how expenses are split among users. Supports both equal and unequal splits.';
COMMENT ON COLUMN transaction_splits.amount IS 'Individual amount this user owes. For equal splits, this is transaction.amount / split_count. For unequal splits, this is the custom amount assigned to the user.';
COMMENT ON COLUMN transaction_splits.transaction_id IS 'References the transaction this split belongs to';
COMMENT ON COLUMN transaction_splits.user_id IS 'The user who owes this split amount';

-- ============================================================================
-- BACKFILL EXISTING DATA
-- ============================================================================

-- Migrate split_among JSONB array to transaction_splits table
-- For equal splits: amount = transaction.amount / split_count
INSERT INTO transaction_splits (transaction_id, user_id, amount)
SELECT 
  t.id as transaction_id,
  jsonb_array_elements_text(t.split_among)::UUID as user_id,
  ROUND((t.amount / NULLIF(jsonb_array_length(t.split_among), 0))::numeric, 2) as amount
FROM transactions t
WHERE t.split_among IS NOT NULL 
  AND jsonb_typeof(t.split_among) = 'array'
  AND jsonb_array_length(t.split_among) > 0
  -- Only migrate transactions that don't already have splits
  AND NOT EXISTS (
    SELECT 1 FROM transaction_splits ts 
    WHERE ts.transaction_id = t.id
  )
ON CONFLICT (transaction_id, user_id) DO NOTHING;

