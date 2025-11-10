-- Group Invitations Migration
-- This migration adds support for inviting users to groups by email
-- Created: 2025-01-10

-- ============================================================================
-- GROUP INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  token VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP
);

-- Indexes for group_invitations
CREATE INDEX IF NOT EXISTS idx_group_invitations_group_id ON group_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invitations_email ON group_invitations(email);
CREATE INDEX IF NOT EXISTS idx_group_invitations_status ON group_invitations(status);
CREATE INDEX IF NOT EXISTS idx_group_invitations_token ON group_invitations(token) WHERE token IS NOT NULL;

-- Unique constraint: only one pending invitation per group+email combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_invitations_unique_pending 
ON group_invitations(group_id, email) 
WHERE status = 'pending';

-- Enable Row Level Security for group_invitations
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS FOR INVITATIONS
-- ============================================================================

-- Function to check if user is a group owner (reuse existing function)
-- Already exists in initial schema, but we'll reference it

-- Function to accept an invitation (adds user to group and marks invitation as accepted)
CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_id UUID,
  accepting_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  invitation_record RECORD;
  current_user_email TEXT;
BEGIN
  -- Get the current user's email from auth context
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = accepting_user_id;

  IF current_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Get and lock the invitation
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE id = invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Verify the invitation is for this user's email
  IF LOWER(invitation_record.email) != LOWER(current_user_email) THEN
    RAISE EXCEPTION 'This invitation is not for your email address';
  END IF;

  -- Check invitation status
  IF invitation_record.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %)', invitation_record.status;
  END IF;

  -- Check if invitation has expired
  IF invitation_record.expires_at < CURRENT_TIMESTAMP THEN
    -- Mark as expired
    UPDATE group_invitations
    SET status = 'expired'
    WHERE id = invitation_id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = invitation_record.group_id
    AND user_id = accepting_user_id
  ) THEN
    -- Mark invitation as accepted even though user was already a member
    UPDATE group_invitations
    SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
    WHERE id = invitation_id;
    RETURN TRUE;
  END IF;

  -- Add user to group as a member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE group_invitations
  SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
  WHERE id = invitation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically accept pending invitations for a user on signup/login
CREATE OR REPLACE FUNCTION accept_pending_invitations_for_user(
  user_email TEXT
)
RETURNS INTEGER AS $$
DECLARE
  invitation_record RECORD;
  v_user_id UUID;
  accepted_count INTEGER := 0;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(user_email);

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Find all pending invitations for this email that haven't expired
  FOR invitation_record IN
    SELECT * FROM group_invitations
    WHERE LOWER(email) = LOWER(user_email)
    AND status = 'pending'
    AND expires_at >= CURRENT_TIMESTAMP
    FOR UPDATE
  LOOP
    -- Check if user is already a member
    IF NOT EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitation_record.group_id
      AND gm.user_id = v_user_id
    ) THEN
      -- Add user to group
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (invitation_record.group_id, v_user_id, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;

    -- Mark invitation as accepted
    UPDATE group_invitations
    SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
    WHERE id = invitation_record.id;

    accepted_count := accepted_count + 1;
  END LOOP;

  -- Mark expired invitations
  UPDATE group_invitations
  SET status = 'expired'
  WHERE LOWER(email) = LOWER(user_email)
  AND status = 'pending'
  AND expires_at < CURRENT_TIMESTAMP;

  RETURN accepted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES FOR GROUP INVITATIONS
-- ============================================================================

-- Users can view invitations for groups they own
-- Note: We can't query auth.users directly in RLS policies, so email matching
-- is handled at the application level when users query by their email parameter
CREATE POLICY "Users can view relevant invitations"
  ON group_invitations
  FOR SELECT
  USING (
    -- Group owners can see all invitations for their groups
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_invitations.group_id
      AND (
        groups.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM group_members
          WHERE group_members.group_id = groups.id
          AND group_members.user_id = auth.uid()
          AND group_members.role = 'owner'
        )
      )
    )
  );

-- Group owners can create invitations
CREATE POLICY "Group owners can create invitations"
  ON group_invitations
  FOR INSERT
  WITH CHECK (
    is_user_group_owner(group_id, auth.uid())
    AND invited_by = auth.uid()
  );

-- Group owners can update invitations (e.g., cancel them)
CREATE POLICY "Group owners can update invitations"
  ON group_invitations
  FOR UPDATE
  USING (
    is_user_group_owner(group_id, auth.uid())
  );

-- Group owners can delete invitations
CREATE POLICY "Group owners can delete invitations"
  ON group_invitations
  FOR DELETE
  USING (
    is_user_group_owner(group_id, auth.uid())
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION accept_group_invitation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_pending_invitations_for_user(TEXT) TO authenticated;

