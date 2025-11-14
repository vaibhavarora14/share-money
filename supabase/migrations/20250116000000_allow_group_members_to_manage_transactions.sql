-- Allow group members to update and delete transactions in their groups
-- Created: 2025-01-16

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

-- Create new policies that allow group members to update/delete transactions
CREATE POLICY "Users can update own transactions or group transactions"
  ON transactions
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
  );

CREATE POLICY "Users can delete own transactions or group transactions"
  ON transactions
  FOR DELETE
  USING (
    auth.uid() = user_id OR
    (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
  );

