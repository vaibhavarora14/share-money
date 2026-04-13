DO $$
DECLARE
  v_existing_group_id UUID := '90000000-0000-0000-0000-000000000001';
  v_signup_group_id UUID := '90000000-0000-0000-0000-000000000002';
  v_existing_invitation_id UUID := '91000000-0000-0000-0000-000000000001';
  v_signup_invitation_id UUID := '91000000-0000-0000-0000-000000000002';
  v_signup_user_id UUID := '92000000-0000-0000-0000-000000000001';
  v_owner_id UUID := '22222222-2222-2222-2222-222222222222'; -- bob@test.com
BEGIN
  -- Ensure deterministic cleanup before each run.
  DELETE FROM public.invitation_reconciliation_audit
  WHERE group_id IN (v_existing_group_id, v_signup_group_id)
     OR email = 'invite-regression-signup@test.com';

  DELETE FROM public.group_invitations WHERE id IN (v_existing_invitation_id, v_signup_invitation_id);
  DELETE FROM public.group_members WHERE group_id IN (v_existing_group_id, v_signup_group_id);
  DELETE FROM public.participants WHERE group_id IN (v_existing_group_id, v_signup_group_id);
  DELETE FROM public.groups WHERE id IN (v_existing_group_id, v_signup_group_id);

  DELETE FROM auth.identities WHERE user_id = v_signup_user_id OR provider_id = 'invite-regression-signup@test.com';
  DELETE FROM auth.users WHERE id = v_signup_user_id OR email = 'invite-regression-signup@test.com';

  INSERT INTO public.groups (id, name, description, created_by)
  VALUES
    (v_existing_group_id, 'Invite Regression Existing User', 'Existing-user reconciliation test', v_owner_id),
    (v_signup_group_id, 'Invite Regression Signup User', 'Signup auto-accept test', v_owner_id);

  INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
  VALUES
    (v_existing_group_id, v_owner_id, 'owner', 'active', NULL),
    (v_signup_group_id, v_owner_id, 'owner', 'active', NULL)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO public.group_invitations (id, group_id, email, invited_by, status, expires_at)
  VALUES
    (v_existing_invitation_id, v_existing_group_id, 'diana@test.com', v_owner_id, 'pending', CURRENT_TIMESTAMP + INTERVAL '14 days'),
    (v_signup_invitation_id, v_signup_group_id, 'invite-regression-signup@test.com', v_owner_id, 'pending', CURRENT_TIMESTAMP + INTERVAL '14 days');
END
$$;
