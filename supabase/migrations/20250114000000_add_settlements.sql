-- Add settlements functionality
-- Created: 2025-01-14
--
-- This migration implements the Settle Up feature:
-- 1. Creates settlements table to track debt settlements between users
-- 2. Settlements reduce balances between users in a group
-- 3. Supports partial settlements (settling less than full balance)

-- ============================================================================
-- CREATE SETTLEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_user_id != to_user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from_user_id ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_user_id ON settlements(to_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_created_at ON settlements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_composite ON settlements(group_id, from_user_id, to_user_id);

-- Enable Row Level Security
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR SETTLEMENTS
-- ============================================================================

-- Users can view settlements in groups they belong to
CREATE POLICY "Users can view settlements in their groups"
  ON settlements
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    OR from_user_id = auth.uid()
    OR to_user_id = auth.uid()
  );

-- Users can create settlements where they are the payer (from_user_id)
CREATE POLICY "Users can create settlements as payer"
  ON settlements
  FOR INSERT
  WITH CHECK (
    auth.uid() = from_user_id
    AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    AND to_user_id IN (
      SELECT user_id FROM group_members 
      WHERE group_id = settlements.group_id
    )
  );

-- Users can update their own settlements (only if they created it)
CREATE POLICY "Users can update their own settlements"
  ON settlements
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Users can delete their own settlements (only if they created it)
CREATE POLICY "Users can delete their own settlements"
  ON settlements
  FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================================================
-- COMMENTS FOR SETTLEMENTS
-- ============================================================================

COMMENT ON TABLE settlements IS 'Tracks debt settlements between users in a group. When a user settles up, it reduces the balance between them.';
COMMENT ON COLUMN settlements.from_user_id IS 'User who is paying (settling the debt)';
COMMENT ON COLUMN settlements.to_user_id IS 'User who is receiving the payment';
COMMENT ON COLUMN settlements.amount IS 'Amount being settled (must be positive)';
COMMENT ON COLUMN settlements.currency IS 'Currency code for the settlement amount';
COMMENT ON COLUMN settlements.notes IS 'Optional notes about the settlement';
COMMENT ON COLUMN settlements.created_by IS 'User who created this settlement record';
