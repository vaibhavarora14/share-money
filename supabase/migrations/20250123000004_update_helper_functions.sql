-- Update Helper Functions for Participants
-- Created: 2025-01-23
--
-- This migration updates database helper functions to work with the participants table.

-- ============================================================================
-- UPDATE accept_group_invitation FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_id UUID,
  accepting_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  invitation_record RECORD;
  current_user_email TEXT;
  participant_record RECORD;
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
    
    -- Update participant if exists
    UPDATE participants
    SET type = 'member',
        user_id = accepting_user_id,
        email = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE group_id = invitation_record.group_id
      AND (LOWER(email) = LOWER(invitation_record.email) OR user_id = accepting_user_id);
    
    RETURN TRUE;
  END IF;

  -- Add user to group as a member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Update or create participant
  -- First, try to find existing participant by email
  SELECT * INTO participant_record
  FROM participants
  WHERE group_id = invitation_record.group_id
    AND LOWER(email) = LOWER(invitation_record.email)
    AND type = 'invited'
  FOR UPDATE;

  IF FOUND THEN
    -- Update existing invited participant to member
    UPDATE participants
    SET 
      type = 'member',
      user_id = accepting_user_id,
      email = NULL,
      role = 'member',
      joined_at = COALESCE(joined_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = participant_record.id;
  ELSE
    -- Create new participant (shouldn't happen, but handle gracefully)
    INSERT INTO participants (group_id, user_id, type, role, joined_at)
    VALUES (invitation_record.group_id, accepting_user_id, 'member', 'member', CURRENT_TIMESTAMP)
    ON CONFLICT (group_id, user_id) DO UPDATE
    SET type = 'member',
        email = NULL,
        updated_at = CURRENT_TIMESTAMP;
  END IF;

  -- Mark invitation as accepted
  UPDATE group_invitations
  SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
  WHERE id = invitation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE handle_new_user FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
  participant_record RECORD;
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

        -- Update participant from 'invited' to 'member'
        SELECT * INTO participant_record
        FROM participants
        WHERE group_id = invitation_record.group_id
          AND LOWER(email) = LOWER(invitation_record.email)
          AND type = 'invited'
        FOR UPDATE;

        IF FOUND THEN
          UPDATE participants
          SET 
            type = 'member',
            user_id = NEW.id,
            email = NULL,
            role = 'member',
            joined_at = COALESCE(joined_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = participant_record.id;
        ELSE
          -- Create participant if doesn't exist (shouldn't happen, but handle gracefully)
          INSERT INTO participants (group_id, user_id, type, role, joined_at)
          VALUES (invitation_record.group_id, NEW.id, 'member', 'member', CURRENT_TIMESTAMP)
          ON CONFLICT (group_id, user_id) DO UPDATE
          SET type = 'member',
              email = NULL,
              updated_at = CURRENT_TIMESTAMP;
        END IF;

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

-- ============================================================================
-- UPDATE remove_group_member FUNCTION
-- ============================================================================

-- Update participant type to 'former' when member leaves
CREATE OR REPLACE FUNCTION remove_group_member(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  target_membership RECORD;
  caller_membership RECORD;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Ensure caller is a member
  SELECT id INTO caller_membership
  FROM group_members
  WHERE group_id = p_group_id
    AND user_id = current_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You must be an active member of the group to manage members';
  END IF;

  -- Lock the target membership row
  SELECT role, status INTO target_membership
  FROM group_members
  WHERE group_id = p_group_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;

  -- Soft leave: mark inactive and timestamp
  UPDATE group_members
  SET status = 'left',
      left_at = NOW()
  WHERE group_id = p_group_id
    AND user_id = p_user_id;

  -- Update participant type to 'former'
  UPDATE participants
  SET 
    type = 'former',
    left_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE group_id = p_group_id
    AND user_id = p_user_id
    AND type = 'member';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- REMOVE OLD MIGRATION FUNCTION
-- ============================================================================

-- Remove the old migrate_email_splits_to_user_id function as it's no longer needed
-- Participants already handle the migration automatically
DROP FUNCTION IF EXISTS migrate_email_splits_to_user_id(UUID, TEXT, UUID);


