-- Create group_invitations table for pending invitations
CREATE TABLE IF NOT EXISTS group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  UNIQUE(group_id, email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_group_invitations_group_id ON group_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invitations_email ON group_invitations(email);
CREATE INDEX IF NOT EXISTS idx_group_invitations_invited_by ON group_invitations(invited_by);

-- Enable Row Level Security (RLS)
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_invitations table
-- Users can view invitations for groups they belong to (as owners/members)
CREATE POLICY "Users can view invitations for their groups"
  ON group_invitations
  FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id FROM group_members gm
      WHERE gm.user_id = auth.uid()
    )
  );

-- Group owners can create invitations
CREATE POLICY "Group owners can create invitations"
  ON group_invitations
  FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT gm.group_id FROM group_members gm
      WHERE gm.user_id = auth.uid() AND gm.role = 'owner'
    )
    AND invited_by = auth.uid()
  );

-- Group owners can delete invitations
CREATE POLICY "Group owners can delete invitations"
  ON group_invitations
  FOR DELETE
  USING (
    group_id IN (
      SELECT gm.group_id FROM group_members gm
      WHERE gm.user_id = auth.uid() AND gm.role = 'owner'
    )
  );

-- Function to process pending invitations when a user signs up
-- This function is called from the application after successful signup/signin
-- It automatically adds the user to all groups they were invited to
-- Uses SECURITY DEFINER to access auth.users table safely
CREATE OR REPLACE FUNCTION accept_pending_invitations()
RETURNS TABLE(group_id UUID, role VARCHAR) AS $$
DECLARE
  current_user_email TEXT;
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get current user's email from auth.users
  -- Using SECURITY DEFINER allows us to access auth.users table
  SELECT LOWER(email) INTO current_user_email
  FROM auth.users
  WHERE id = current_user_id;

  IF current_user_email IS NULL THEN
    -- User exists but email is not available yet (shouldn't happen, but handle gracefully)
    RAISE EXCEPTION 'User email not found';
  END IF;

  -- Add user to all groups they were invited to
  -- Use ON CONFLICT to handle race conditions where user might already be a member
  INSERT INTO group_members (group_id, user_id, role)
  SELECT 
    gi.group_id,
    current_user_id,
    gi.role
  FROM group_invitations gi
  WHERE gi.email = current_user_email
    AND gi.accepted_at IS NULL
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Mark invitations as accepted (only for invitations that were just processed)
  -- This ensures we don't mark invitations that were already accepted
  UPDATE group_invitations
  SET accepted_at = CURRENT_TIMESTAMP
  WHERE email = current_user_email
    AND accepted_at IS NULL
    AND group_id IN (
      SELECT group_id FROM group_members 
      WHERE user_id = current_user_id
    );

  -- Return the groups the user was added to
  RETURN QUERY
  SELECT gm.group_id, gm.role
  FROM group_members gm
  WHERE gm.user_id = current_user_id
    AND gm.group_id IN (
      SELECT gi.group_id
      FROM group_invitations gi
      WHERE gi.email = current_user_email
        AND gi.accepted_at IS NOT NULL
        AND gi.accepted_at >= CURRENT_TIMESTAMP - INTERVAL '5 seconds'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_pending_invitations() TO authenticated;

