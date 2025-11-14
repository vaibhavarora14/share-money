-- Allow users to create settlements where they are the receiver (to_user_id)
-- Created: 2025-01-16
--
-- This migration updates the RLS policy to allow users to create settlements
-- where they are either the payer (from_user_id) or the receiver (to_user_id).
-- This enables the "Mark as Received" functionality in the UI.

-- Drop the old policy
DROP POLICY IF EXISTS "Users can create settlements as payer" ON settlements;

-- Create a new policy that allows users to create settlements as either payer or receiver
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

