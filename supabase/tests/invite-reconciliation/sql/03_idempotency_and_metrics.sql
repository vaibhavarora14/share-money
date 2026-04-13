DO $$
DECLARE
  v_existing_group_id UUID := '90000000-0000-0000-0000-000000000001';
  v_existing_invitation_id UUID := '91000000-0000-0000-0000-000000000001';
  v_existing_user_id UUID := '44444444-4444-4444-4444-444444444444';
  v_membership_count INTEGER;
  v_invite_status TEXT;
  v_pending_for_existing_users INTEGER;
  v_failed_events_last_24h INTEGER;
  v_no_pending_audit_count INTEGER;
BEGIN
  PERFORM public.reconcile_pending_invitations_for_user(
    v_existing_user_id,
    'diana@test.com',
    'backfill_job'
  );

  SELECT COUNT(*) INTO v_membership_count
  FROM public.group_members
  WHERE group_id = v_existing_group_id
    AND user_id = v_existing_user_id;

  IF v_membership_count <> 1 THEN
    RAISE EXCEPTION 'Expected idempotent membership upsert (count=1), found: %', v_membership_count;
  END IF;

  SELECT status INTO v_invite_status
  FROM public.group_invitations
  WHERE id = v_existing_invitation_id;

  IF v_invite_status <> 'accepted' THEN
    RAISE EXCEPTION 'Invitation regressed from accepted state, found: %', v_invite_status;
  END IF;

  SELECT pending_for_existing_users, failed_events_last_24h
  INTO v_pending_for_existing_users, v_failed_events_last_24h
  FROM public.invitation_reconciliation_metrics;

  IF v_pending_for_existing_users <> 0 THEN
    RAISE EXCEPTION 'Expected pending_for_existing_users = 0, found: %', v_pending_for_existing_users;
  END IF;

  IF v_failed_events_last_24h <> 0 THEN
    RAISE EXCEPTION 'Expected failed_events_last_24h = 0 in deterministic tests, found: %', v_failed_events_last_24h;
  END IF;

  SELECT COUNT(*) INTO v_no_pending_audit_count
  FROM public.invitation_reconciliation_audit
  WHERE source = 'backfill_job'
    AND outcome = 'no_pending'
    AND email = 'diana@test.com';

  IF v_no_pending_audit_count < 1 THEN
    RAISE EXCEPTION 'Expected no_pending audit event for idempotent reconcile rerun';
  END IF;
END
$$;
