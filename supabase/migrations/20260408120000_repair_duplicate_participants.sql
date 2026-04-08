-- Repair duplicate invited/member participants and harden invitation acceptance
-- Created: 2026-04-08

-- ----------------------------------------------------------------------------
-- 1) Helper: merge one duplicate participant into canonical participant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_participant_into_canonical(
  p_canonical_participant_id UUID,
  p_duplicate_participant_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_canonical_group_id UUID;
  v_duplicate_group_id UUID;
BEGIN
  IF p_canonical_participant_id IS NULL
     OR p_duplicate_participant_id IS NULL
     OR p_canonical_participant_id = p_duplicate_participant_id THEN
    RETURN;
  END IF;

  SELECT group_id INTO v_canonical_group_id
  FROM public.participants
  WHERE id = p_canonical_participant_id
  FOR UPDATE;

  SELECT group_id INTO v_duplicate_group_id
  FROM public.participants
  WHERE id = p_duplicate_participant_id
  FOR UPDATE;

  -- If either row is missing (already merged) or they are from different groups,
  -- skip safely.
  IF v_canonical_group_id IS NULL
     OR v_duplicate_group_id IS NULL
     OR v_canonical_group_id <> v_duplicate_group_id THEN
    RETURN;
  END IF;

  -- Move splits without violating unique (transaction_id, participant_id).
  UPDATE public.transaction_splits ts
  SET participant_id = p_canonical_participant_id
  WHERE ts.participant_id = p_duplicate_participant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.transaction_splits ts2
      WHERE ts2.transaction_id = ts.transaction_id
        AND ts2.participant_id = p_canonical_participant_id
    );

  -- Remove leftover split rows that could not be moved because canonical rows exist.
  DELETE FROM public.transaction_splits
  WHERE participant_id = p_duplicate_participant_id;

  -- Re-point payer participant
  UPDATE public.transactions
  SET paid_by_participant_id = p_canonical_participant_id
  WHERE paid_by_participant_id = p_duplicate_participant_id;

  -- Re-point settlements
  UPDATE public.settlements
  SET from_participant_id = p_canonical_participant_id
  WHERE from_participant_id = p_duplicate_participant_id;

  UPDATE public.settlements
  SET to_participant_id = p_canonical_participant_id
  WHERE to_participant_id = p_duplicate_participant_id;

  -- Remove redundant participant row
  DELETE FROM public.participants
  WHERE id = p_duplicate_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2) Repair function: invited duplicate -> member/former canonical by email
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_participant_duplicates(
  p_target_group_id UUID DEFAULT NULL,
  p_target_email TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  rec RECORD;
  v_merged_count INTEGER := 0;
  v_target_email_norm TEXT := LOWER(TRIM(p_target_email));
BEGIN
  FOR rec IN
    WITH user_rows AS (
      SELECT
        p.id,
        p.group_id,
        p.type,
        COALESCE(LOWER(TRIM(p.email)), LOWER(TRIM(u.email))) AS normalized_email,
        p.created_at
      FROM public.participants p
      LEFT JOIN auth.users u ON u.id = p.user_id
      WHERE p.user_id IS NOT NULL
    ),
    canonical_user_rows AS (
      SELECT
        ur.*,
        ROW_NUMBER() OVER (
          PARTITION BY ur.group_id, ur.normalized_email
          ORDER BY
            CASE
              WHEN ur.type = 'member' THEN 0
              WHEN ur.type = 'former' THEN 1
              ELSE 2
            END,
            ur.created_at ASC
        ) AS rn
      FROM user_rows ur
      WHERE ur.normalized_email IS NOT NULL
    )
    SELECT
      c.group_id,
      c.normalized_email,
      c.id AS canonical_id,
      i.id AS duplicate_id
    FROM canonical_user_rows c
    JOIN public.participants i
      ON i.group_id = c.group_id
     AND i.type = 'invited'
     AND i.email IS NOT NULL
     AND LOWER(TRIM(i.email)) = c.normalized_email
     AND i.id <> c.id
    WHERE c.rn = 1
      AND (p_target_group_id IS NULL OR c.group_id = p_target_group_id)
      AND (v_target_email_norm IS NULL OR c.normalized_email = v_target_email_norm)
  LOOP
    PERFORM public.merge_participant_into_canonical(rec.canonical_id, rec.duplicate_id);
    v_merged_count := v_merged_count + 1;
  END LOOP;

  RETURN v_merged_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3) Harden sync function to always repair duplicates after user linking
-- ----------------------------------------------------------------------------
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

  -- Prefer user-linked participant state when user_id is provided.
  IF p_user_id IS NOT NULL THEN
    -- If email is not explicitly passed, derive from auth.users for merge lookup.
    IF v_normalized_email IS NULL THEN
      SELECT LOWER(TRIM(email))
      INTO v_normalized_email
      FROM auth.users
      WHERE id = p_user_id;
    END IF;

    INSERT INTO public.participants (group_id, user_id, email, type, role, joined_at)
    VALUES (
      p_group_id,
      p_user_id,
      NULL,
      p_target_type,
      p_role,
      CASE WHEN p_target_type = 'member' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET
      email = NULL,
      type = EXCLUDED.type,
      role = COALESCE(p_role, public.participants.role),
      left_at = CASE
        WHEN EXCLUDED.type = 'former' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END,
      joined_at = COALESCE(public.participants.joined_at, EXCLUDED.joined_at),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_participant_id;

    IF v_normalized_email IS NOT NULL THEN
      PERFORM public.repair_participant_duplicates(p_group_id, v_normalized_email);
      -- Refresh canonical id by user_id after repair.
      SELECT id INTO v_participant_id
      FROM public.participants
      WHERE group_id = p_group_id
        AND user_id = p_user_id;
    END IF;

    RETURN v_participant_id;
  END IF;

  -- Invitation / email-only participant
  IF v_normalized_email IS NOT NULL THEN
    INSERT INTO public.participants (group_id, email, type, role)
    VALUES (p_group_id, v_normalized_email, p_target_type, p_role)
    ON CONFLICT (group_id, email)
    DO UPDATE SET
      type = EXCLUDED.type,
      role = COALESCE(p_role, public.participants.role),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_participant_id;

    RETURN v_participant_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4) Harden invitation acceptance: pass email into sync path
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_group_invitation(
  invitation_id UUID,
  accepting_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_invitation RECORD;
  v_email TEXT;
BEGIN
  -- 1. Get user email
  SELECT email INTO v_email FROM auth.users WHERE id = accepting_user_id;
  
  -- 2. Lock and Check Invitation
  SELECT * INTO v_invitation FROM public.group_invitations 
  WHERE id = invitation_id AND status = 'pending' AND expires_at >= CURRENT_TIMESTAMP 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or expired';
  END IF;

  IF LOWER(v_invitation.email) != LOWER(v_email) THEN
    RAISE EXCEPTION 'Invitation email mismatch';
  END IF;

  -- 3. Update Invitation
  UPDATE public.group_invitations 
  SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP 
  WHERE id = invitation_id;

  -- 4. Sync participant and ensure membership.
  PERFORM public.sync_participant_state(
    v_invitation.group_id,
    accepting_user_id,
    v_invitation.email,
    'member',
    'member'
  );

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invitation.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active', left_at = NULL;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5) Immediate targeted cleanup for reported issue
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_group_id UUID;
BEGIN
  SELECT g.id
  INTO v_group_id
  FROM public.groups g
  WHERE g.name = 'Sri Lanka trip'
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    PERFORM public.repair_participant_duplicates(v_group_id, 'repair-target@example.com');
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6) Global idempotent repair for historical duplicates
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.repair_participant_duplicates(NULL, NULL);
END;
$$;
