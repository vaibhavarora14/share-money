-- Backfill pending invitations for users who already exist in auth.users
-- Created: 2026-04-04
--
-- Purpose:
-- - Resolve historical cases where users signed up/sign in happened but pending
--   invitations were not auto-accepted.
-- - Safe and idempotent: only touches currently pending invitations with a matching
--   auth user email.

DO $$
DECLARE
  invitation_record RECORD;
BEGIN
  FOR invitation_record IN
    SELECT
      gi.id AS invitation_id,
      gi.group_id,
      gi.email,
      u.id AS user_id
    FROM public.group_invitations gi
    JOIN auth.users u
      ON LOWER(u.email) = LOWER(gi.email)
    WHERE gi.status = 'pending'
      AND gi.expires_at >= CURRENT_TIMESTAMP
    FOR UPDATE OF gi
  LOOP
    BEGIN
      -- Keep participant state consistent with the unified participant model.
      PERFORM public.sync_participant_state(
        invitation_record.group_id,
        invitation_record.user_id,
        invitation_record.email,
        'member',
        'member'
      );

      -- Ensure membership exists and reactivate previously-left records.
      INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
      VALUES (
        invitation_record.group_id,
        invitation_record.user_id,
        'member',
        'active',
        NULL
      )
      ON CONFLICT (group_id, user_id)
      DO UPDATE SET
        role = CASE
          WHEN public.group_members.role = 'owner' THEN public.group_members.role
          ELSE EXCLUDED.role
        END,
        status = 'active',
        left_at = NULL;

      -- Mark invitation accepted once membership/participant updates succeed.
      UPDATE public.group_invitations
      SET status = 'accepted',
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = invitation_record.invitation_id
        AND status = 'pending';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'backfill pending invitation failed (invitation_id: %, group_id: %, email: %, user_id: %): %',
          invitation_record.invitation_id,
          invitation_record.group_id,
          invitation_record.email,
          invitation_record.user_id,
          SQLERRM;
    END;
  END LOOP;

  -- Expire old invites for users that do exist but invitation lifetime has passed.
  UPDATE public.group_invitations gi
  SET status = 'expired'
  WHERE gi.status = 'pending'
    AND gi.expires_at < CURRENT_TIMESTAMP
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE LOWER(u.email) = LOWER(gi.email)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification SQL (run manually after deploy)
-- ---------------------------------------------------------------------------
-- 1) Remaining pending invitations for existing users should be 0 (or expected exceptions)
-- SELECT COUNT(*) AS pending_for_existing_users
-- FROM public.group_invitations gi
-- JOIN auth.users u ON LOWER(u.email) = LOWER(gi.email)
-- WHERE gi.status = 'pending'
--   AND gi.expires_at >= CURRENT_TIMESTAMP;
--
-- 2) Spot-check accepted invitations
-- SELECT id, group_id, email, status, accepted_at
-- FROM public.group_invitations
-- WHERE status = 'accepted'
-- ORDER BY accepted_at DESC
-- LIMIT 50;
