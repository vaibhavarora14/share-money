-- Fix infinite recursion in RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view groups they belong to" ON groups;
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Group owners can add members" ON group_members;
DROP POLICY IF EXISTS "Group owners can update member roles" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups or owners can remove members" ON group_members;

-- Create a SECURITY DEFINER function to check membership (bypasses RLS)
CREATE OR REPLACE FUNCTION is_user_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id AND user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate groups SELECT policy - users can see groups they created or are members of
CREATE POLICY "Users can view groups they belong to"
  ON groups
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR is_user_group_member(id, auth.uid())
  );

-- Recreate group_members SELECT policy - users can see members of groups they created or belong to
CREATE POLICY "Users can view members of their groups"
  ON group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid()
        OR is_user_group_member(group_members.group_id, auth.uid())
      )
    )
  );

-- Recreate group_members INSERT policy - only owners can add members
CREATE POLICY "Group owners can add members"
  ON group_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'owner'
        )
      )
    )
  );

-- Recreate group_members UPDATE policy - only owners can update roles
CREATE POLICY "Group owners can update member roles"
  ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'owner'
        )
      )
    )
  );

-- Recreate group_members DELETE policy - users can leave or owners can remove
CREATE POLICY "Users can leave groups or owners can remove members"
  ON group_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'owner'
        )
      )
    )
  );
