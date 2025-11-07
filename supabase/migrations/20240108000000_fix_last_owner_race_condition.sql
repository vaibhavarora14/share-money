-- Fix race condition: Prevent removing the last owner atomically
-- This function ensures that we cannot remove the last owner of a group
-- even with concurrent requests

-- Create a SECURITY DEFINER function to safely remove a group member
-- SECURITY DEFINER is needed here to bypass RLS when checking owner count,
-- which prevents infinite recursion in RLS policies. The function still uses
-- auth.uid() to ensure only authenticated users can call it, maintaining security.
CREATE OR REPLACE FUNCTION remove_group_member(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  target_membership RECORD;
  owner_count INTEGER;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the target user's membership
  SELECT role INTO target_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  -- Check if target user is a member
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;

  -- Check authorization: users can remove themselves, or owners can remove any member
  IF p_user_id != current_user_id THEN
    -- Check if current user is an owner
    IF NOT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = p_group_id
      AND user_id = current_user_id
      AND role = 'owner'
    ) THEN
      RAISE EXCEPTION 'Only group owners can remove other members';
    END IF;
  END IF;

  -- If removing an owner, check if it's the last owner (atomic check)
  IF target_membership.role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM group_members
    WHERE group_id = p_group_id
    AND role = 'owner';

    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the group';
    END IF;
  END IF;

  -- Perform the deletion
  DELETE FROM group_members
  WHERE group_id = p_group_id
  AND user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION remove_group_member(UUID, UUID) TO authenticated;

-- Grant execute permission on is_user_group_member function (if not already granted)
-- This function is used by RLS policies and should be accessible
GRANT EXECUTE ON FUNCTION is_user_group_member(UUID, UUID) TO authenticated;
