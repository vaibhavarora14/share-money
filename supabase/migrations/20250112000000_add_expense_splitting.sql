-- Add expense splitting fields to transactions table
-- Created: 2025-01-12
--
-- This migration adds:
-- - paid_by: UUID of the user who paid for the expense
-- - split_among: JSONB array of user IDs who the expense is split among
-- - Constraint to ensure split_among is always an array or null

-- ============================================================================
-- ADD EXPENSE SPLITTING FIELDS
-- ============================================================================

-- Add paid_by field (nullable, only for expenses)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add split_among field (JSONB array of user IDs)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS split_among JSONB DEFAULT '[]'::jsonb;

-- Add index for paid_by for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_paid_by ON transactions(paid_by);

-- Add index for split_among (GIN index for JSONB array queries)
CREATE INDEX IF NOT EXISTS idx_transactions_split_among ON transactions USING GIN (split_among);

-- Add comments for documentation
COMMENT ON COLUMN transactions.paid_by IS 'User ID of the person who paid for this expense';
COMMENT ON COLUMN transactions.split_among IS 'JSONB array of user IDs who this expense is split among (equal split)';

-- ============================================================================
-- ADD CONSTRAINT FOR split_among
-- ============================================================================

-- First, clean up any invalid data (shouldn't exist, but safety first)
UPDATE transactions
SET split_among = '[]'::jsonb
WHERE split_among IS NOT NULL 
  AND jsonb_typeof(split_among) != 'array';

-- Add constraint to ensure split_among is always an array or null
ALTER TABLE transactions
ADD CONSTRAINT check_split_among_is_array 
CHECK (
  split_among IS NULL 
  OR jsonb_typeof(split_among) = 'array'
);

-- Add comment for constraint
COMMENT ON CONSTRAINT check_split_among_is_array ON transactions IS 
'Ensures split_among is always a JSONB array or null';
