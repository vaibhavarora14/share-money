-- Allow active group members to reactivate inactive members
-- Created: 2025-12-20

-- Drop the old policy that only allows owners to update
DROP POLICY IF EXISTS "Group owners can update member roles" ON group_members;

-- Create a new policy that allows active members to update group_members
-- This enables reactivating inactive members (status='left' -> status='active')
-- Uses the is_user_active_group_member function we created earlier
CREATE POLICY "Active members can update group members"
  ON group_members
  FOR UPDATE
  USING (
    is_user_active_group_member(group_id, auth.uid())
  )
  WITH CHECK (
    is_user_active_group_member(group_id, auth.uid())
  );

