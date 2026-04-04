-- Forward fix: make signup auto-join robust with participant sync
-- Created: 2026-04-04
--
-- This updates handle_new_user() so new signups reliably auto-accept
-- pending invites by email, while keeping participant/group_members state aligned.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Ensure profile exists for each new auth user.
  INSERT INTO public.profiles (id, profile_completed)
  VALUES (NEW.id, FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- No email means invite matching is not possible.
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Accept all valid pending invitations for this signup email.
  FOR invitation_record IN
    SELECT id, group_id, email
    FROM public.group_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at >= CURRENT_TIMESTAMP
    FOR UPDATE
  LOOP
    BEGIN
      -- Merge invited-email participant into user-linked member participant.
      PERFORM public.sync_participant_state(
        invitation_record.group_id,
        NEW.id,
        invitation_record.email,
        'member',
        'member'
      );

      -- Ensure membership exists and reactivate if previously left.
      INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
      VALUES (invitation_record.group_id, NEW.id, 'member', 'active', NULL)
      ON CONFLICT (group_id, user_id)
      DO UPDATE SET
        role = CASE
          WHEN public.group_members.role = 'owner' THEN public.group_members.role
          ELSE EXCLUDED.role
        END,
        status = 'active',
        left_at = NULL;

      -- Mark invitation accepted only after successful member sync.
      UPDATE public.group_invitations
      SET status = 'accepted',
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = invitation_record.id
        AND status = 'pending';
    EXCEPTION
      WHEN OTHERS THEN
        -- Continue processing remaining invitations while preserving diagnostics.
        RAISE WARNING 'handle_new_user invite processing failed (user_id: %, email: %, invitation_id: %, group_id: %): %',
          NEW.id,
          NEW.email,
          invitation_record.id,
          invitation_record.group_id,
          SQLERRM;
    END;
  END LOOP;

  -- Expire stale pending invitations for this email.
  UPDATE public.group_invitations
  SET status = 'expired'
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at < CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Automatically creates profile and auto-accepts pending invitations on signup using sync_participant_state with per-invitation fault tolerance';
