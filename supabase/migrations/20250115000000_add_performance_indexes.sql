-- Add performance indexes for frequently queried columns
-- Created: 2025-01-15

-- Indexes for transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_paid_by ON transactions(paid_by);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Indexes for settlements table
CREATE INDEX IF NOT EXISTS idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_user ON settlements(to_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);

-- Indexes for group_members table
CREATE INDEX IF NOT EXISTS idx_group_members_role ON group_members(role);
CREATE INDEX IF NOT EXISTS idx_group_members_composite ON group_members(group_id, user_id);

-- Indexes for transaction_splits table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_splits') THEN
    CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_splits_user_id ON transaction_splits(user_id);
  END IF;
END $$;
