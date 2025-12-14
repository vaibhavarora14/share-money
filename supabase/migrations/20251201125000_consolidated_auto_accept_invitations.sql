-- Consolidated: Auto-accept invitations on signup with performance optimization
-- Created: 2025-12-01
--
-- This migration consolidates the following migrations into a single, optimized version:
-- - 20250115000001_auto_accept_invitations_on_signup.sql (superseded)
-- - 20250115000002_fix_auto_accept_invitations_inline.sql (superseded)
-- - 20251201123000_fix_auto_accept_invitations_inline.sql (superseded)
-- - 20251201124000_add_invitations_email_status_index.sql (superseded)
--
-- This migration:
-- 1. Updates handle_new_user() to auto-accept pending invitations (inlined for reliability)
-- 2. Adds performance index for invitation lookup
--
-- Prerequisites: 
-- - Profiles table must exist (created by 20251201120000_add_profiles_fix.sql or earlier)
-- - group_invitations table must exist (created by 20250110100343_add_group_invitations.sql)

-- Update handle_new_user function with inlined invitation acceptance logic
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

-- Add composite index for invitation lookup performance
-- This optimizes the query in handle_new_user() that looks up pending invitations by email
CREATE INDEX IF NOT EXISTS idx_group_invitations_email_status_pending 
ON group_invitations(LOWER(email), status) 
WHERE status = 'pending';

-- Update the comment to reflect the new behavior
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile record and accepts pending group invitations when a new user signs up (with inlined logic for reliability)';
