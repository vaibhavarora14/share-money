-- Support email-based splits for invited users who haven't signed up
-- Created: 2025-01-22
--
-- This migration enables including invited users in transactions before they sign up
-- by allowing transaction_splits to reference users by email address.
--
-- When an invited user signs up and accepts the invitation, their email-based splits
-- will be automatically converted to user_id-based splits.

-- ============================================================================
-- MODIFY TRANSACTION_SPLITS TABLE
-- ============================================================================

-- Make user_id nullable and add email column
ALTER TABLE transaction_splits
  ALTER COLUMN user_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS transaction_splits_user_id_fkey,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add constraint: either user_id or email must be provided (but not both)
ALTER TABLE transaction_splits
  ADD CONSTRAINT check_user_id_or_email 
  CHECK (
    (user_id IS NOT NULL AND email IS NULL) OR
    (user_id IS NULL AND email IS NOT NULL)
  );

-- Update unique constraint to support both user_id and email
DROP INDEX IF EXISTS idx_transaction_splits_composite;
ALTER TABLE transaction_splits
  DROP CONSTRAINT IF EXISTS transaction_splits_transaction_id_user_id_key;

-- Create separate unique indexes for user_id and email (partial indexes)
-- These are used for uniqueness enforcement and can be referenced in ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_splits_transaction_user_id
  ON transaction_splits(transaction_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_splits_transaction_email
  ON transaction_splits(transaction_id, email)
  WHERE email IS NOT NULL;

-- Note: PostgreSQL can use these partial unique indexes in ON CONFLICT clauses
-- when the WHERE condition is satisfied. For seed data with user_id, use:
-- ON CONFLICT (transaction_id, user_id) DO NOTHING;

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_transaction_splits_email 
  ON transaction_splits(email) 
  WHERE email IS NOT NULL;

-- Add foreign key constraint back (only for non-null user_id)
ALTER TABLE transaction_splits
  ADD CONSTRAINT transaction_splits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add comments
COMMENT ON COLUMN transaction_splits.user_id IS 'User ID for registered users. NULL if user is invited but not yet signed up.';
COMMENT ON COLUMN transaction_splits.email IS 'Email address for invited users who haven''t signed up yet. NULL if user_id is provided.';
COMMENT ON CONSTRAINT check_user_id_or_email ON transaction_splits IS 'Ensures either user_id or email is provided, but not both';

-- ============================================================================
-- FUNCTION: Convert email-based splits to user_id when invitation is accepted
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_email_splits_to_user_id(
  p_group_id UUID,
  p_email TEXT,
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update transaction_splits that reference this email in transactions for this group
  -- Only update splits where the email matches and user_id is NULL
  UPDATE transaction_splits ts
  SET 
    user_id = p_user_id,
    email = NULL
  FROM transactions t
  WHERE ts.transaction_id = t.id
    AND t.group_id = p_group_id
    AND ts.email IS NOT NULL
    AND LOWER(ts.email) = LOWER(p_email)
    AND ts.user_id IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION migrate_email_splits_to_user_id(UUID, TEXT, UUID) TO authenticated;

-- ============================================================================
-- UPDATE accept_group_invitation TO MIGRATE SPLITS
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_id UUID,
  accepting_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  invitation_record RECORD;
  current_user_email TEXT;
  migrated_splits_count INTEGER;
BEGIN
  -- Get the current user's email from auth context
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = accepting_user_id;

  IF current_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Get and lock the invitation
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE id = invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Verify the invitation is for this user's email
  IF LOWER(invitation_record.email) != LOWER(current_user_email) THEN
    RAISE EXCEPTION 'This invitation is not for your email address';
  END IF;

  -- Check invitation status
  IF invitation_record.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %)', invitation_record.status;
  END IF;

  -- Check if invitation has expired
  IF invitation_record.expires_at < CURRENT_TIMESTAMP THEN
    -- Mark as expired
    UPDATE group_invitations
    SET status = 'expired'
    WHERE id = invitation_id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = invitation_record.group_id
    AND user_id = accepting_user_id
  ) THEN
    -- Mark invitation as accepted even though user was already a member
    UPDATE group_invitations
    SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
    WHERE id = invitation_id;
    RETURN TRUE;
  END IF;

  -- Add user to group as a member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Migrate email-based splits to user_id for this group and email
  SELECT migrate_email_splits_to_user_id(
    invitation_record.group_id,
    invitation_record.email,
    accepting_user_id
  ) INTO migrated_splits_count;

  -- Mark invitation as accepted
  UPDATE group_invitations
  SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
  WHERE id = invitation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE handle_new_user TO MIGRATE SPLITS ON AUTO-ACCEPT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
  migrated_splits_count INTEGER;
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, profile_completed)
  VALUES (NEW.id, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- Auto-accept pending invitations for this user's email
  -- Inline the logic to avoid function lookup timing issues
  IF NEW.email IS NOT NULL THEN
    BEGIN
      -- Find all pending invitations for this email that haven't expired
      FOR invitation_record IN
        SELECT * FROM public.group_invitations
        WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at >= CURRENT_TIMESTAMP
        FOR UPDATE
      LOOP
        -- Check if user is already a member
        IF NOT EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = invitation_record.group_id
          AND gm.user_id = NEW.id
        ) THEN
          -- Add user to group
          INSERT INTO public.group_members (group_id, user_id, role)
          VALUES (invitation_record.group_id, NEW.id, 'member')
          ON CONFLICT (group_id, user_id) DO NOTHING;
        END IF;

        -- Migrate email-based splits to user_id for this group and email
        SELECT migrate_email_splits_to_user_id(
          invitation_record.group_id,
          invitation_record.email,
          NEW.id
        ) INTO migrated_splits_count;

        -- Mark invitation as accepted
        UPDATE public.group_invitations
        SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
        WHERE id = invitation_record.id;
      END LOOP;

      -- Mark expired invitations
      UPDATE public.group_invitations
      SET status = 'expired'
      WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at < CURRENT_TIMESTAMP;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but don't fail the trigger (profile creation should still succeed)
        RAISE WARNING 'Error accepting pending invitations for user % (id: %): %', NEW.email, NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

