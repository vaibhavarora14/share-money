-- Fix auto-accept invitations in handle_new_user trigger
-- Created: 2025-12-01 (Production-safe version)
--
-- NOTE: This migration is identical to 20250115000002_fix_auto_accept_invitations_inline.sql
-- It was created as a new migration (not modifying existing ones) to ensure safe
-- deployment to production databases that cannot be reset. Both migrations are
-- functionally identical and safe to run multiple times (uses CREATE OR REPLACE).
--
-- This migration updates the handle_new_user() trigger function to inline
-- the invitation acceptance logic directly, avoiding function lookup timing
-- issues. This ensures invitations are accepted reliably when new users sign up.

-- Update the handle_new_user function with inlined invitation acceptance logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
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

-- Update the comment to reflect the new behavior
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile record and accepts pending group invitations when a new user signs up (with inlined logic for reliability)';
