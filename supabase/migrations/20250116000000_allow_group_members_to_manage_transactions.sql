-- Allow group members to update and delete transactions in their groups
-- Created: 2025-01-16
--
-- NOTE: This policy intentionally allows ANY group member to modify/delete ANY transaction
-- in the group, not just transactions they created. This enables collaborative expense
-- management where any member can correct mistakes or update shared expenses.
-- The application layer (netlify/functions/transactions.ts) also enforces this permission.

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

-- Create new policies that allow group members to update/delete transactions
-- Policy allows:
-- 1. Users to update/delete their own transactions (anywhere)
-- 2. Group members to update/delete any transaction in groups they belong to
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

