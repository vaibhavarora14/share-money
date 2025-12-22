-- Allow any active group member to create invitations (not just owners)
-- Created: 2025-12-20

-- Update the RLS policy to allow any active member to create invitations
DROP POLICY IF EXISTS "Group owners can create invitations" ON group_invitations;

-- Create a helper function to check if user is an active member
CREATE OR REPLACE FUNCTION is_user_active_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user created the group
  IF EXISTS (
    SELECT 1 FROM groups
    WHERE id = check_group_id AND created_by = check_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is an active member
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    -- Status column exists - check for active status
    RETURN EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = check_group_id
      AND user_id = check_user_id
      AND status = 'active'
    );
  ELSE
    -- No status column - just check membership
    RETURN EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = check_group_id
      AND user_id = check_user_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Group members can create invitations"
  ON group_invitations
  FOR INSERT
  WITH CHECK (
    is_user_active_group_member(group_id, auth.uid())
    AND invited_by = auth.uid()
  );

-- Also update is_user_group_owner to check status if the column exists
CREATE OR REPLACE FUNCTION is_user_group_owner(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- First check if user created the group
  IF EXISTS (
    SELECT 1 FROM groups
    WHERE id = check_group_id AND created_by = check_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Then check if user is an owner member (and active if status column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    -- Status column exists - check for active owner
    RETURN EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = check_group_id 
      AND user_id = check_user_id 
      AND role = 'owner'
      AND status = 'active'
    );
  ELSE
    -- No status column - just check owner role
    RETURN EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = check_group_id 
      AND user_id = check_user_id 
      AND role = 'owner'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION is_user_active_group_member(UUID, UUID) TO authenticated;

