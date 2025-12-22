-- Create Participants Table
-- Created: 2025-01-23
--
-- This migration creates a unified participants table that represents all group participants
-- (active members, invited users, and former members) with a single participant_id reference.
-- This eliminates the need to mix UUIDs and emails in the same fields.

-- ============================================================================
-- CREATE PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  
  -- Either user_id OR email (mutually exclusive based on type)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  
  -- Participant type and role
  type VARCHAR(20) NOT NULL CHECK (type IN ('member', 'invited', 'former')),
  role VARCHAR(20) CHECK (role IN ('owner', 'member')),
  
  -- Cached profile data (for performance, avoids joins)
  full_name VARCHAR(255),
  avatar_url TEXT,
  
  -- Timestamps
  joined_at TIMESTAMP,
  left_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints: exactly one of user_id or email based on type
  CONSTRAINT check_participant_type_member 
    CHECK (
      (type = 'member' AND user_id IS NOT NULL AND email IS NULL) OR
      (type = 'invited' AND user_id IS NULL AND email IS NOT NULL) OR
      (type = 'former' AND user_id IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_participants_group_id ON participants(group_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_type ON participants(type);
CREATE INDEX IF NOT EXISTS idx_participants_group_type ON participants(group_id, type);

-- Unique constraints using standard indexes (PostgreSQL treats NULLs as distinct)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_group_user 
  ON participants(group_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique_group_email 
  ON participants(group_id, email);

-- Enable Row Level Security
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR PARTICIPANTS
-- ============================================================================

-- Users can view participants in groups they belong to
CREATE POLICY "Users can view participants in their groups"
  ON participants
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members 
      WHERE user_id = auth.uid()
    )
    OR group_id IN (
      SELECT group_id FROM groups WHERE created_by = auth.uid()
    )
  );

-- Users can insert participants (for invitations)
CREATE POLICY "Users can create participants for invitations"
  ON participants
  FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM group_members 
      WHERE user_id = auth.uid()
    )
    OR group_id IN (
      SELECT group_id FROM groups WHERE created_by = auth.uid()
    )
  );

-- Users can update participants in their groups
CREATE POLICY "Users can update participants in their groups"
  ON participants
  FOR UPDATE
  USING (
    group_id IN (
      SELECT group_id FROM group_members 
      WHERE user_id = auth.uid()
    )
    OR group_id IN (
      SELECT group_id FROM groups WHERE created_by = auth.uid()
    )
  );

-- ============================================================================
-- HELPER FUNCTION: Get or Create Participant
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_participant(
  p_group_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_email VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_participant_id UUID;
  v_type VARCHAR(20);
BEGIN
  -- Determine participant type
  IF p_user_id IS NOT NULL THEN
    v_type := 'member';
  ELSIF p_email IS NOT NULL THEN
    v_type := 'invited';
  ELSE
    RAISE EXCEPTION 'Either user_id or email must be provided';
  END IF;

  -- Try to find existing participant
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_participant_id
    FROM participants
    WHERE group_id = p_group_id AND user_id = p_user_id
    LIMIT 1;
  ELSE
    SELECT id INTO v_participant_id
    FROM participants
    WHERE group_id = p_group_id AND LOWER(email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  -- Create if doesn't exist
  IF v_participant_id IS NULL THEN
    INSERT INTO participants (group_id, user_id, email, type)
    VALUES (p_group_id, p_user_id, p_email, v_type)
    RETURNING id INTO v_participant_id;
  END IF;

  RETURN v_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_or_create_participant(UUID, UUID, VARCHAR) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE participants IS 'Unified table representing all group participants (members, invited users, former members)';
COMMENT ON COLUMN participants.type IS 'Type of participant: member (active), invited (pending), or former (left)';
COMMENT ON COLUMN participants.user_id IS 'User ID for members and former members. NULL for invited users who haven''t signed up.';
COMMENT ON COLUMN participants.email IS 'Email address for invited users who haven''t signed up. NULL for members and former members.';
COMMENT ON FUNCTION get_or_create_participant IS 'Gets existing participant or creates new one for given group and identifier (user_id or email)';

