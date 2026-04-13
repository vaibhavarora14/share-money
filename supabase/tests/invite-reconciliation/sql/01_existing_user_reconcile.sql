DO $$
DECLARE
  v_existing_group_id UUID := '90000000-0000-0000-0000-000000000001';
  v_existing_invitation_id UUID := '91000000-0000-0000-0000-000000000001';
  v_existing_user_id UUID := '44444444-4444-4444-4444-444444444444'; -- diana@test.com
  v_invite_status TEXT;
  v_membership_count INTEGER;
  v_participant_count INTEGER;
  v_audit_count INTEGER;
BEGIN
  PERFORM public.reconcile_pending_invitations_for_user(
    v_existing_user_id,
    'diana@test.com',
    'backfill_job'
  );

  SELECT status INTO v_invite_status
  FROM public.group_invitations
  WHERE id = v_existing_invitation_id;

  IF v_invite_status <> 'accepted' THEN
    RAISE EXCEPTION 'Expected existing-user invitation to be accepted, found: %', v_invite_status;
  END IF;

  SELECT COUNT(*) INTO v_membership_count
  FROM public.group_members
  WHERE group_id = v_existing_group_id
    AND user_id = v_existing_user_id
    AND status = 'active';

  IF v_membership_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active membership after reconcile, found: %', v_membership_count;
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM public.participants
  WHERE group_id = v_existing_group_id
    AND user_id = v_existing_user_id
    AND type = 'member';

  IF v_participant_count <> 1 THEN
    RAISE EXCEPTION 'Expected one linked participant after reconcile, found: %', v_participant_count;
  END IF;

  SELECT COUNT(*) INTO v_audit_count
  FROM public.invitation_reconciliation_audit
  WHERE source = 'backfill_job'
    AND invitation_id = v_existing_invitation_id
    AND outcome = 'accepted';

  IF v_audit_count < 1 THEN
    RAISE EXCEPTION 'Expected accepted backfill_job audit event for invitation %', v_existing_invitation_id;
  END IF;
END
$$;
