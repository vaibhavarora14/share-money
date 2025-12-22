-- Update Settlements Schema for Participants
-- Created: 2025-01-23
--
-- This migration adds participant_id columns to settlements and migrates existing data.

-- ============================================================================
-- ADD PARTICIPANT_ID COLUMNS
-- ============================================================================

-- Add participant_id columns (keep from_user_id and to_user_id for backward compatibility)
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS from_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;

-- ============================================================================
-- MIGRATE EXISTING SETTLEMENT DATA
-- ============================================================================

-- Migrate from_user_id -> from_participant_id
UPDATE settlements s
SET from_participant_id = pm.participant_id
FROM participant_mapping pm
WHERE s.from_user_id IS NOT NULL
  AND pm.old_user_id = s.from_user_id
  AND pm.group_id = s.group_id
  AND s.from_participant_id IS NULL;

-- Migrate to_user_id -> to_participant_id
UPDATE settlements s
SET to_participant_id = pm.participant_id
FROM participant_mapping pm
WHERE s.to_user_id IS NOT NULL
  AND pm.old_user_id = s.to_user_id
  AND pm.group_id = s.group_id
  AND s.to_participant_id IS NULL;

-- ============================================================================
-- ADD INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_settlements_from_participant 
  ON settlements(from_participant_id) 
  WHERE from_participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_settlements_to_participant 
  ON settlements(to_participant_id) 
  WHERE to_participant_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN settlements.from_participant_id IS 'Participant who is paying. Replaces from_user_id for unified participant handling.';
COMMENT ON COLUMN settlements.to_participant_id IS 'Participant who is receiving. Replaces to_user_id for unified participant handling.';


