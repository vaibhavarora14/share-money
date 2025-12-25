-- Fix handle_new_user order to prevent race conditions
-- Created: 2025-01-26
--
-- This migration updates the handle_new_user function to reorder operations:
-- 1. First merging participant records (email -> user_id)
-- 2. Then inserting into group_members
--
-- This prevents the trigger on group_members from creating duplicate participants
-- which would otherwise cause unique constraint violations.

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
        
        -- 1. FIRST: Update participant from 'invited' to 'member' (Merge Email -> User ID)
        -- This must happen BEFORE inserting into group_members to prevent the trigger
        -- from creating a duplicate 'member' participant.
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

        -- 2. SECOND: Add user to group
        -- Now that the participant is linked to the user_id, the trigger on group_members
        -- will find the existing participant and update it (harmlessly), instead of trying to create a new one.
        IF NOT EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = invitation_record.group_id
          AND gm.user_id = NEW.id
        ) THEN
          INSERT INTO public.group_members (group_id, user_id, role)
          VALUES (invitation_record.group_id, NEW.id, 'member')
          ON CONFLICT (group_id, user_id) DO NOTHING;
        END IF;

        -- 3. THIRD: Mark invitation as accepted
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
