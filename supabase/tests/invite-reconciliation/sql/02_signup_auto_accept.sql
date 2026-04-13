DO $$
DECLARE
  v_signup_group_id UUID := '90000000-0000-0000-0000-000000000002';
  v_signup_invitation_id UUID := '91000000-0000-0000-0000-000000000002';
  v_signup_user_id UUID := '92000000-0000-0000-0000-000000000001';
  v_email TEXT := 'invite-regression-signup@test.com';
  v_invite_status TEXT;
  v_membership_count INTEGER;
  v_participant_count INTEGER;
  v_audit_count INTEGER;
BEGIN
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_current,
    email_change_token_new,
    phone_change,
    phone_change_token,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    v_signup_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    v_email,
    extensions.crypt('testpassword123', extensions.gen_salt('bf', 10)),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Invite Regression Signup"}',
    FALSE,
    'authenticated'
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_signup_user_id,
    format('{"sub":"%s","email":"%s"}', v_signup_user_id, v_email)::jsonb,
    'email',
    v_email,
    NOW(),
    NOW(),
    NOW()
  );

  SELECT status INTO v_invite_status
  FROM public.group_invitations
  WHERE id = v_signup_invitation_id;

  IF v_invite_status <> 'accepted' THEN
    RAISE EXCEPTION 'Expected signup invitation to be accepted by trigger, found: %', v_invite_status;
  END IF;

  SELECT COUNT(*) INTO v_membership_count
  FROM public.group_members
  WHERE group_id = v_signup_group_id
    AND user_id = v_signup_user_id
    AND status = 'active';

  IF v_membership_count <> 1 THEN
    RAISE EXCEPTION 'Expected one active membership for signup user, found: %', v_membership_count;
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM public.participants
  WHERE group_id = v_signup_group_id
    AND user_id = v_signup_user_id
    AND type = 'member';

  IF v_participant_count <> 1 THEN
    RAISE EXCEPTION 'Expected one participant linked for signup user, found: %', v_participant_count;
  END IF;

  SELECT COUNT(*) INTO v_audit_count
  FROM public.invitation_reconciliation_audit
  WHERE source = 'signup_trigger'
    AND invitation_id = v_signup_invitation_id
    AND outcome = 'accepted';

  IF v_audit_count < 1 THEN
    RAISE EXCEPTION 'Expected signup_trigger accepted audit event for invitation %', v_signup_invitation_id;
  END IF;
END
$$;
