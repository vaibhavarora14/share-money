DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id AS user_id, u.email
    FROM public.group_invitations gi
    JOIN auth.users u ON LOWER(u.email) = LOWER(gi.email)
    WHERE gi.status = 'pending'
      AND gi.expires_at >= CURRENT_TIMESTAMP
  LOOP
    PERFORM public.reconcile_pending_invitations_for_user(
      r.user_id,
      r.email,
      'backfill_job'
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  v_pending_count INTEGER;
BEGIN
  SELECT pending_for_existing_users
  INTO v_pending_count
  FROM public.invitation_reconciliation_metrics;

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'Auto-heal completed but pending_for_existing_users remained at %', v_pending_count;
  END IF;
END
$$;

SELECT * FROM public.invitation_reconciliation_metrics;
