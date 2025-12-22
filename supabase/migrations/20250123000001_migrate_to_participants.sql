-- Migrate Existing Data to Participants Table
-- Created: 2025-01-23
--
-- This migration populates the participants table from existing group_members and
-- group_invitations data, and creates a mapping table for migrating transactions.

-- ============================================================================
-- MIGRATE GROUP MEMBERS TO PARTICIPANTS
-- ============================================================================

-- Migrate active members
-- Check if status column exists, if not assume all are active members
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    -- Status column exists - use it
    INSERT INTO participants (group_id, user_id, type, role, joined_at, created_at, updated_at)
    SELECT 
      gm.group_id,
      gm.user_id,
      CASE 
        WHEN gm.status = 'left' THEN 'former'
        ELSE 'member'
      END as type,
      gm.role,
      gm.joined_at,
      gm.joined_at,
      COALESCE(gm.left_at, gm.joined_at)
    FROM group_members gm
    WHERE NOT EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.group_id = gm.group_id 
        AND p.user_id = gm.user_id
    );
  ELSE
    -- Status column doesn't exist - all are active members
    INSERT INTO participants (group_id, user_id, type, role, joined_at, created_at, updated_at)
    SELECT 
      gm.group_id,
      gm.user_id,
      'member' as type,
      gm.role,
      gm.joined_at,
      gm.joined_at,
      gm.joined_at
    FROM group_members gm
    WHERE NOT EXISTS (
      SELECT 1 FROM participants p 
      WHERE p.group_id = gm.group_id 
        AND p.user_id = gm.user_id
    );
  END IF;
END $$;

-- ============================================================================
-- MIGRATE GROUP INVITATIONS TO PARTICIPANTS
-- ============================================================================

-- Migrate pending invitations (only those without user_id - users who haven't signed up)
INSERT INTO participants (group_id, email, type, created_at, updated_at)
SELECT 
  gi.group_id,
  gi.email,
  'invited' as type,
  gi.created_at,
  gi.created_at
FROM group_invitations gi
WHERE gi.status = 'pending'
  AND gi.expires_at >= CURRENT_TIMESTAMP
  -- Only create if user hasn't signed up yet (no existing participant with user_id)
  AND NOT EXISTS (
    SELECT 1 FROM participants p
    WHERE p.group_id = gi.group_id 
      AND p.user_id IN (
        SELECT id FROM auth.users WHERE LOWER(email) = LOWER(gi.email)
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM participants p
    WHERE p.group_id = gi.group_id
      AND LOWER(p.email) = LOWER(gi.email)
  );

-- ============================================================================
-- CREATE MAPPING TABLE
-- ============================================================================

-- This table helps map old references to new participant_ids during migration
-- Will be dropped in cleanup migration
CREATE TABLE IF NOT EXISTS participant_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  old_user_id UUID,
  old_email VARCHAR(255),
  participant_id UUID NOT NULL,
  CONSTRAINT check_mapping_has_identifier CHECK (
    (old_user_id IS NOT NULL AND old_email IS NULL) OR
    (old_user_id IS NULL AND old_email IS NOT NULL)
  )
);

-- Create unique indexes for the mapping
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_group_user 
  ON participant_mapping(group_id, old_user_id) 
  WHERE old_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_group_email 
  ON participant_mapping(group_id, old_email) 
  WHERE old_email IS NOT NULL;

-- Clear any existing data (for idempotency)
TRUNCATE TABLE participant_mapping;

-- Populate mapping for user_id-based participants
INSERT INTO participant_mapping (group_id, old_user_id, participant_id)
SELECT DISTINCT
  p.group_id,
  p.user_id,
  p.id
FROM participants p
WHERE p.user_id IS NOT NULL;

-- Populate mapping for email-based participants
INSERT INTO participant_mapping (group_id, old_email, participant_id)
SELECT DISTINCT
  p.group_id,
  p.email,
  p.id
FROM participants p
WHERE p.email IS NOT NULL;

-- Create indexes on mapping table for fast lookups
CREATE INDEX IF NOT EXISTS idx_mapping_group_user ON participant_mapping(group_id, old_user_id) WHERE old_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mapping_group_email ON participant_mapping(group_id, old_email) WHERE old_email IS NOT NULL;

-- ============================================================================
-- ENRICH PARTICIPANTS WITH PROFILE DATA
-- ============================================================================

-- Update participants with profile data for members/former members
UPDATE participants p
SET 
  full_name = pr.full_name,
  avatar_url = pr.avatar_url,
  updated_at = CURRENT_TIMESTAMP
FROM profiles pr
WHERE p.user_id = pr.id
  AND (p.full_name IS NULL OR p.avatar_url IS NULL);

-- Update participants with email from auth.users for members/former members
-- (for participants that don't have email but should)
UPDATE participants p
SET updated_at = CURRENT_TIMESTAMP
FROM auth.users u
WHERE p.user_id = u.id
  AND p.email IS NULL
  AND p.type IN ('member', 'former');

