-- Update Transaction Schema for Participants
-- Created: 2025-01-23
--
-- This migration adds participant_id columns to transactions and transaction_splits,
-- migrates existing data, and sets up foreign key constraints.

-- ============================================================================
-- ADD PARTICIPANT_ID COLUMNS
-- ============================================================================

-- Add paid_by_participant_id to transactions (keep paid_by for backward compatibility)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS paid_by_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;

-- Add participant_id to transaction_splits (keep user_id and email for backward compatibility)
ALTER TABLE transaction_splits
  ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE CASCADE;

-- ============================================================================
-- MIGRATE EXISTING TRANSACTION DATA
-- ============================================================================

-- Migrate transaction_splits: user_id -> participant_id
UPDATE transaction_splits ts
SET participant_id = pm.participant_id
FROM participant_mapping pm
WHERE ts.user_id IS NOT NULL
  AND pm.old_user_id = ts.user_id
  AND pm.group_id = (
    SELECT group_id FROM transactions t WHERE t.id = ts.transaction_id
  )
  AND ts.participant_id IS NULL;

-- Migrate transaction_splits: email -> participant_id
UPDATE transaction_splits ts
SET participant_id = pm.participant_id
FROM participant_mapping pm
WHERE ts.email IS NOT NULL
  AND LOWER(pm.old_email) = LOWER(ts.email)
  AND pm.group_id = (
    SELECT group_id FROM transactions t WHERE t.id = ts.transaction_id
  )
  AND ts.participant_id IS NULL;

-- Migrate transactions.paid_by -> paid_by_participant_id
UPDATE transactions t
SET paid_by_participant_id = pm.participant_id
FROM participant_mapping pm
WHERE t.paid_by IS NOT NULL
  AND pm.old_user_id = t.paid_by
  AND pm.group_id = t.group_id
  AND t.paid_by_participant_id IS NULL;

-- Note: paid_by should always be a UUID (user_id), not an email
-- If there are any email-based paid_by values (which shouldn't happen),
-- they would need to be handled separately, but this is not expected

-- ============================================================================
-- ADD CONSTRAINTS AND INDEXES
-- ============================================================================

-- Add unique constraint for transaction_splits (transaction_id, participant_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_splits_transaction_participant
  ON transaction_splits(transaction_id, participant_id)
  WHERE participant_id IS NOT NULL;

-- Add index for paid_by_participant_id
CREATE INDEX IF NOT EXISTS idx_transactions_paid_by_participant 
  ON transactions(paid_by_participant_id) 
  WHERE paid_by_participant_id IS NOT NULL;

-- Add index for transaction_splits.participant_id
CREATE INDEX IF NOT EXISTS idx_transaction_splits_participant_id 
  ON transaction_splits(participant_id) 
  WHERE participant_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN transactions.paid_by_participant_id IS 'Participant who paid for this expense. Replaces paid_by for unified participant handling.';
COMMENT ON COLUMN transaction_splits.participant_id IS 'Participant this split belongs to. Replaces user_id/email for unified participant handling.';

