-- Fix Race Condition in sync_participant_state
-- Created: 2025-12-21
--
-- This migration fixes the non-atomic SELECT-then-INSERT/UPDATE pattern
-- in sync_participant_state using INSERT ... ON CONFLICT.

CREATE OR REPLACE FUNCTION public.sync_participant_state(
  p_group_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'member',
  p_target_type TEXT DEFAULT 'member'
)
RETURNS UUID AS $$
DECLARE
  v_participant_id UUID;
  v_normalized_email TEXT;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  -- 1. If user_id is provided, prioritize it.
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.participants (group_id, user_id, email, type, role, joined_at)
    VALUES (
      p_group_id, 
      p_user_id, 
      NULL, -- Explicitly clear email when linked to user_id
      p_target_type, 
      p_role, 
      CASE WHEN p_target_type = 'member' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET
      email = NULL, -- Ensure email is cleared on update too
      type = EXCLUDED.type,
      role = COALESCE(p_role, participants.role),
      left_at = CASE WHEN EXCLUDED.type = 'former' THEN CURRENT_TIMESTAMP ELSE participants.left_at END,
      joined_at = COALESCE(participants.joined_at, EXCLUDED.joined_at),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_participant_id;

    -- Cleanup: If there was a participant record for this email that isn't linked to a user yet,
    -- and we just linked the user, we should ideally merge them.
    -- For now, we simply ensure we don't have duplicates by removing the email-only record
    -- if the caller provided an email that matches.
    IF v_normalized_email IS NOT NULL THEN
      DELETE FROM public.participants 
      WHERE group_id = p_group_id AND LOWER(email) = v_normalized_email AND user_id IS NULL;
    END IF;

    RETURN v_participant_id;
  END IF;

  -- 2. If no user_id, use email.
  IF v_normalized_email IS NOT NULL THEN
    INSERT INTO public.participants (group_id, email, type, role)
    VALUES (p_group_id, v_normalized_email, p_target_type, p_role)
    ON CONFLICT (group_id, email) WHERE email IS NOT NULL
    DO UPDATE SET
      type = EXCLUDED.type,
      role = COALESCE(p_role, participants.role),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_participant_id;

    RETURN v_participant_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
