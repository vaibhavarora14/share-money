-- Allow invited users in transactions and settlements, and add country_code to profiles
-- Created: 2025-01-21 (combined migration)
--
-- This migration:
-- 1. Adds helper function to check if a user has a pending invitation to a group
-- 2. Updates RLS policies to allow group members to modify transactions/settlements
--    created by users who are not group members (uninvited users)
-- 3. Enables invited users (pending invitations) to be included in transactions and settlements
-- 4. Adds country_code column to profiles table for phone number country selection

-- ============================================================================
-- HELPER FUNCTION: Check if user has pending invitation to group
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_invited_to_group(
  check_group_id UUID,
  check_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get user's email from auth.users
  -- Note: This requires SECURITY DEFINER to access auth.users table
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = check_user_id;
  
  -- If user not found, return false
  IF user_email IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if there's a pending invitation for this email
  -- Uses case-insensitive email matching and validates expiration
  RETURN EXISTS (
    SELECT 1 FROM group_invitations
    WHERE group_id = check_group_id
    AND LOWER(email) = LOWER(user_email)
    AND status = 'pending'
    AND expires_at >= CURRENT_TIMESTAMP
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_user_invited_to_group(UUID, UUID) TO authenticated;

-- ============================================================================
-- HELPER FUNCTION: Check if user is member OR invited to group
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_member_or_invited(
  check_group_id UUID,
  check_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is a member (reuse existing function for consistency)
  IF is_user_group_member(check_group_id, check_user_id) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has a pending invitation
  RETURN is_user_invited_to_group(check_group_id, check_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_user_member_or_invited(UUID, UUID) TO authenticated;

-- ============================================================================
-- UPDATE TRANSACTION POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can update own transactions or group transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions or group transactions" ON transactions;

-- Create updated policies that allow:
-- 1. Users to update/delete their own transactions (anywhere)
-- 2. Group members to update/delete any transaction in groups they belong to
--    (including transactions created by uninvited users)
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
-- UPDATE SETTLEMENT POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can update their own settlements" ON settlements;
DROP POLICY IF EXISTS "Users can delete their own settlements" ON settlements;
DROP POLICY IF EXISTS "Users can create settlements as payer or receiver" ON settlements;

-- Create updated policy for creating settlements
-- Allows settlements between group members OR between group members and invited users
CREATE POLICY "Users can create settlements as payer or receiver"
  ON settlements
  FOR INSERT
  WITH CHECK (
    (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    AND (
      -- Current user is payer and receiver is member or invited
      (auth.uid() = from_user_id AND (
        is_user_group_member(group_id, to_user_id) OR
        is_user_invited_to_group(group_id, to_user_id)
      ))
      OR
      -- Current user is receiver and payer is member or invited
      (auth.uid() = to_user_id AND (
        is_user_group_member(group_id, from_user_id) OR
        is_user_invited_to_group(group_id, from_user_id)
      ))
    )
  );

-- Create updated policies for updating/deleting settlements
-- Allows group members to modify settlements in their groups (including those created by uninvited users)
DROP POLICY IF EXISTS "Users can update settlements in their groups" ON settlements;
CREATE POLICY "Users can update settlements in their groups"
  ON settlements
  FOR UPDATE
  USING (
    auth.uid() = created_by OR
    (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = created_by OR
    (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete settlements in their groups" ON settlements;
CREATE POLICY "Users can delete settlements in their groups"
  ON settlements
  FOR DELETE
  USING (
    auth.uid() = created_by OR
    (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
  );

-- ============================================================================
-- UPDATE TRANSACTION_SPLITS POLICIES
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create splits for their transactions" ON transaction_splits;
DROP POLICY IF EXISTS "Users can update splits for their transactions" ON transaction_splits;
DROP POLICY IF EXISTS "Users can delete splits for their transactions" ON transaction_splits;

-- Create updated policies that allow group members to manage splits for group transactions
DROP POLICY IF EXISTS "Users can create splits for group transactions" ON transaction_splits;
CREATE POLICY "Users can create splits for group transactions"
  ON transaction_splits
  FOR INSERT
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE user_id = auth.uid()
      OR (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update splits for group transactions" ON transaction_splits;
CREATE POLICY "Users can update splits for group transactions"
  ON transaction_splits
  FOR UPDATE
  USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE user_id = auth.uid()
      OR (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can delete splits for group transactions" ON transaction_splits;
CREATE POLICY "Users can delete splits for group transactions"
  ON transaction_splits
  FOR DELETE
  USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE user_id = auth.uid()
      OR (group_id IS NOT NULL AND is_user_group_member(group_id, auth.uid()))
    )
  );

-- ============================================================================
-- ADD COUNTRY_CODE COLUMN TO PROFILES
-- ============================================================================

-- Add country_code column to profiles table
-- This field stores the ISO country code (e.g., 'US', 'CA', 'IN') for the phone number country selection.
-- This helps distinguish between countries that share the same dial code (e.g., +1 for US and Canada).
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) 
  CHECK (country_code IS NULL OR (LENGTH(country_code) = 2 AND country_code ~ '^[A-Z]{2}$'));

-- Add comment
COMMENT ON COLUMN profiles.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., US, CA, IN) for phone number country selection. Must be exactly 2 uppercase letters if provided.';
