-- Guardrails: invite reconciliation observability and sign-in recovery
-- Created: 2026-04-13

CREATE TABLE IF NOT EXISTS public.invitation_reconciliation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('signup_trigger', 'sign_in_reconcile', 'backfill_job')),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NULL,
  invitation_id UUID NULL REFERENCES public.group_invitations(id) ON DELETE SET NULL,
  group_id UUID NULL REFERENCES public.groups(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'failed', 'no_pending')),
  error_code TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitation_reconciliation_audit_created_at
  ON public.invitation_reconciliation_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invitation_reconciliation_audit_outcome_created_at
  ON public.invitation_reconciliation_audit(outcome, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_invitation_reconciliation_event(
  p_source TEXT,
  p_user_id UUID,
  p_email TEXT,
  p_invitation_id UUID,
  p_group_id UUID,
  p_outcome TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.invitation_reconciliation_audit (
    source,
    user_id,
    email,
    invitation_id,
    group_id,
    outcome,
    error_code,
    error_message
  )
  VALUES (
    p_source,
    p_user_id,
    p_email,
    p_invitation_id,
    p_group_id,
    p_outcome,
    p_error_code,
    p_error_message
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Never block signup/signin due to audit logging failures.
    RAISE WARNING 'log_invitation_reconciliation_event failed (source: %, user_id: %, invitation_id: %): %',
      p_source,
      p_user_id,
      p_invitation_id,
      SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reconcile_pending_invitations_for_user(
  p_user_id UUID DEFAULT auth.uid(),
  p_user_email TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'sign_in_reconcile'
)
RETURNS TABLE (
  accepted_count INTEGER,
  failed_count INTEGER,
  processed_count INTEGER
) AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  invitation_record RECORD;
BEGIN
  accepted_count := 0;
  failed_count := 0;
  processed_count := 0;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE(p_user_email, u.email)
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  FOR invitation_record IN
    SELECT id, group_id, email
    FROM public.group_invitations
    WHERE LOWER(email) = LOWER(v_email)
      AND status = 'pending'
      AND expires_at >= CURRENT_TIMESTAMP
    FOR UPDATE
  LOOP
    BEGIN
      PERFORM public.sync_participant_state(
        invitation_record.group_id,
        v_user_id,
        invitation_record.email,
        'member',
        'member'
      );

      INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
      VALUES (invitation_record.group_id, v_user_id, 'member', 'active', NULL)
      ON CONFLICT (group_id, user_id)
      DO UPDATE SET
        role = CASE
          WHEN public.group_members.role = 'owner' THEN public.group_members.role
          ELSE EXCLUDED.role
        END,
        status = 'active',
        left_at = NULL;

      UPDATE public.group_invitations
      SET status = 'accepted',
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = invitation_record.id
        AND status = 'pending';

      accepted_count := accepted_count + 1;
      processed_count := processed_count + 1;

      PERFORM public.log_invitation_reconciliation_event(
        p_source,
        v_user_id,
        v_email,
        invitation_record.id,
        invitation_record.group_id,
        'accepted'
      );
    EXCEPTION
      WHEN OTHERS THEN
        failed_count := failed_count + 1;
        processed_count := processed_count + 1;

        PERFORM public.log_invitation_reconciliation_event(
          p_source,
          v_user_id,
          v_email,
          invitation_record.id,
          invitation_record.group_id,
          'failed',
          SQLSTATE,
          SQLERRM
        );
    END;
  END LOOP;

  UPDATE public.group_invitations
  SET status = 'expired'
  WHERE LOWER(email) = LOWER(v_email)
    AND status = 'pending'
    AND expires_at < CURRENT_TIMESTAMP;

  IF processed_count = 0 THEN
    PERFORM public.log_invitation_reconciliation_event(
      p_source,
      v_user_id,
      v_email,
      NULL,
      NULL,
      'no_pending'
    );
  END IF;

  RETURN QUERY SELECT accepted_count, failed_count, processed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_pending_invitations_for_user(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE VIEW public.invitation_reconciliation_metrics AS
SELECT
  (
    SELECT COUNT(*)
    FROM public.group_invitations gi
    JOIN auth.users u ON LOWER(u.email) = LOWER(gi.email)
    WHERE gi.status = 'pending'
      AND gi.expires_at >= CURRENT_TIMESTAMP
  ) AS pending_for_existing_users,
  (
    SELECT COUNT(*)
    FROM public.invitation_reconciliation_audit
    WHERE outcome = 'failed'
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  ) AS failed_events_last_24h,
  (
    SELECT COUNT(*)
    FROM public.invitation_reconciliation_audit
    WHERE outcome = 'accepted'
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
  ) AS accepted_events_last_24h,
  CURRENT_TIMESTAMP AS generated_at;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
  v_processed_count INTEGER := 0;
BEGIN
  INSERT INTO public.profiles (id, profile_completed)
  VALUES (NEW.id, FALSE)
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email IS NULL THEN
    PERFORM public.log_invitation_reconciliation_event(
      'signup_trigger',
      NEW.id,
      NULL,
      NULL,
      NULL,
      'no_pending'
    );
    RETURN NEW;
  END IF;

  FOR invitation_record IN
    SELECT id, group_id, email
    FROM public.group_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at >= CURRENT_TIMESTAMP
    FOR UPDATE
  LOOP
    BEGIN
      PERFORM public.sync_participant_state(
        invitation_record.group_id,
        NEW.id,
        invitation_record.email,
        'member',
        'member'
      );

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

      UPDATE public.group_invitations
      SET status = 'accepted',
          accepted_at = CURRENT_TIMESTAMP
      WHERE id = invitation_record.id
        AND status = 'pending';

      v_processed_count := v_processed_count + 1;

      PERFORM public.log_invitation_reconciliation_event(
        'signup_trigger',
        NEW.id,
        NEW.email,
        invitation_record.id,
        invitation_record.group_id,
        'accepted'
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_processed_count := v_processed_count + 1;

        PERFORM public.log_invitation_reconciliation_event(
          'signup_trigger',
          NEW.id,
          NEW.email,
          invitation_record.id,
          invitation_record.group_id,
          'failed',
          SQLSTATE,
          SQLERRM
        );
    END;
  END LOOP;

  UPDATE public.group_invitations
  SET status = 'expired'
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at < CURRENT_TIMESTAMP;

  IF v_processed_count = 0 THEN
    PERFORM public.log_invitation_reconciliation_event(
      'signup_trigger',
      NEW.id,
      NEW.email,
      NULL,
      NULL,
      'no_pending'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reconcile_pending_invitations_for_user(UUID, TEXT, TEXT) IS
  'Best-effort invite reconciliation for existing users on sign-in with audit logs and participant sync.';
