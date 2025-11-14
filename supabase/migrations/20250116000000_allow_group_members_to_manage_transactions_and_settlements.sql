-- Allow group members to manage transactions and settlements
-- Created: 2025-01-16
--
-- This migration updates RLS policies to:
-- 1. Allow group members to update/delete transactions in their groups
-- 2. Allow users to create settlements as either payer or receiver
--
-- NOTE: Transaction policies intentionally allow ANY group member to modify/delete ANY transaction
-- in the group, not just transactions they created. This enables collaborative expense
-- management where any member can correct mistakes or update shared expenses.
-- The application layer (netlify/functions/transactions.ts) also enforces this permission.

-- ============================================================================
-- TRANSACTION POLICIES
-- ============================================================================

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

-- ============================================================================
-- SETTLEMENT POLICIES
-- ============================================================================

-- Drop the old policy
DROP POLICY IF EXISTS "Users can create settlements as payer" ON settlements;

-- Create a new policy that allows users to create settlements as either payer or receiver
-- This enables the "Mark as Received" functionality in the UI.
CREATE POLICY "Users can create settlements as payer or receiver"
  ON settlements
  FOR INSERT
  WITH CHECK (
    (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    AND (
      (auth.uid() = from_user_id AND to_user_id IN (
        SELECT user_id FROM group_members 
        WHERE group_id = settlements.group_id
      ))
      OR
      (auth.uid() = to_user_id AND from_user_id IN (
        SELECT user_id FROM group_members 
        WHERE group_id = settlements.group_id
      ))
    )
  );

