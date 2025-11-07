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
  current_user_role VARCHAR(20);
  owner_count INTEGER;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the target user's membership and lock the row
  -- FOR UPDATE ensures no concurrent modifications can occur
  SELECT role INTO STRICT target_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id
  FOR UPDATE;

  -- Check authorization: users can remove themselves, or owners can remove any member
  IF p_user_id != current_user_id THEN
    -- Check if current user is an owner (lock the row to prevent concurrent role changes)
    SELECT role INTO current_user_role
    FROM group_members
    WHERE group_id = p_group_id
    AND user_id = current_user_id
    FOR UPDATE;
    
    IF NOT FOUND OR current_user_role != 'owner' THEN
      RAISE EXCEPTION 'Only group owners can remove other members';
    END IF;
  END IF;

  -- If removing an owner, check if it's the last owner (atomic check with lock)
  -- Lock all owner rows to prevent concurrent removals
  IF target_membership.role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM group_members
    WHERE group_id = p_group_id
    AND role = 'owner'
    FOR UPDATE;  -- Lock all owner rows to prevent race conditions

    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the group';
    END IF;
  END IF;

  -- Perform the deletion (row is already locked, so this is safe)
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
