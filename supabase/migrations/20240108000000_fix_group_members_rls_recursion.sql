-- Fix infinite recursion in group_members RLS policies
-- The issue: INSERT/UPDATE/DELETE policies query group_members directly, causing recursion
-- Solution: Use SECURITY DEFINER functions that bypass RLS

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group owners can add members" ON group_members;
DROP POLICY IF EXISTS "Group owners can update member roles" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups or owners can remove members" ON group_members;

-- Create a SECURITY DEFINER function to check if user is group owner (bypasses RLS)
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
  
  -- Then check if user is an owner member
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id 
    AND user_id = check_user_id 
    AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate group_members INSERT policy - only owners can add members
-- Uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "Group owners can add members"
  ON group_members
  FOR INSERT
  WITH CHECK (
    is_user_group_owner(group_id, auth.uid())
  );

-- Recreate group_members UPDATE policy - only owners can update roles
-- Uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "Group owners can update member roles"
  ON group_members
  FOR UPDATE
  USING (
    is_user_group_owner(group_id, auth.uid())
  );

-- Recreate group_members DELETE policy - users can leave or owners can remove
-- Uses SECURITY DEFINER function to avoid recursion
CREATE POLICY "Users can leave groups or owners can remove members"
  ON group_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_user_group_owner(group_id, auth.uid())
  );

