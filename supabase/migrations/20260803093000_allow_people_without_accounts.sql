-- Allow group people without ShareMoney accounts
-- Created: 2026-08-03
--
-- A participant may now represent a real group person before they have an app
-- account or an invitation. Splits, settlements, and balances continue to use
-- participant_id so history can be linked to an account later.

BEGIN;

ALTER TABLE public.participants
  DROP CONSTRAINT IF EXISTS check_participant_type_member;

ALTER TABLE public.participants
  ADD CONSTRAINT check_participant_type_member
  CHECK (
    (
      type = 'member'
      AND (
        (user_id IS NOT NULL AND email IS NULL)
        OR (
          user_id IS NULL
          AND NULLIF(BTRIM(COALESCE(full_name, '')), '') IS NOT NULL
        )
      )
    )
    OR (type = 'invited' AND user_id IS NULL AND email IS NOT NULL)
    OR (
      type = 'former'
      AND (
        user_id IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(full_name, '')), '') IS NOT NULL
      )
    )
  );

-- Merge one duplicate participant into a canonical participant without losing
-- split amounts if both rows appear on the same transaction.
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

  IF v_canonical_group_id IS NULL
     OR v_duplicate_group_id IS NULL
     OR v_canonical_group_id <> v_duplicate_group_id THEN
    RETURN;
  END IF;

  UPDATE public.participants canonical
  SET
    full_name = COALESCE(canonical.full_name, duplicate.full_name),
    avatar_url = COALESCE(canonical.avatar_url, duplicate.avatar_url),
    role = COALESCE(canonical.role, duplicate.role),
    joined_at = COALESCE(canonical.joined_at, duplicate.joined_at),
    left_at = CASE
      WHEN canonical.type = 'former' THEN COALESCE(canonical.left_at, duplicate.left_at, CURRENT_TIMESTAMP)
      ELSE canonical.left_at
    END,
    updated_at = CURRENT_TIMESTAMP
  FROM public.participants duplicate
  WHERE canonical.id = p_canonical_participant_id
    AND duplicate.id = p_duplicate_participant_id;

  WITH duplicate_splits AS (
    SELECT transaction_id, amount
    FROM public.transaction_splits
    WHERE participant_id = p_duplicate_participant_id
  )
  UPDATE public.transaction_splits canonical_split
  SET amount = canonical_split.amount + duplicate_splits.amount
  FROM duplicate_splits
  WHERE canonical_split.transaction_id = duplicate_splits.transaction_id
    AND canonical_split.participant_id = p_canonical_participant_id;

  UPDATE public.transaction_splits duplicate_split
  SET participant_id = p_canonical_participant_id
  WHERE duplicate_split.participant_id = p_duplicate_participant_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.transaction_splits canonical_split
      WHERE canonical_split.transaction_id = duplicate_split.transaction_id
        AND canonical_split.participant_id = p_canonical_participant_id
    );

  DELETE FROM public.transaction_splits
  WHERE participant_id = p_duplicate_participant_id;

  UPDATE public.transactions
  SET paid_by_participant_id = p_canonical_participant_id
  WHERE paid_by_participant_id = p_duplicate_participant_id;

  UPDATE public.settlements
  SET from_participant_id = p_canonical_participant_id
  WHERE from_participant_id = p_duplicate_participant_id;

  UPDATE public.settlements
  SET to_participant_id = p_canonical_participant_id
  WHERE to_participant_id = p_duplicate_participant_id;

  DELETE FROM public.participants
  WHERE id = p_duplicate_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
      p.id AS duplicate_id
    FROM canonical_user_rows c
    JOIN public.participants p
      ON p.group_id = c.group_id
     AND p.user_id IS NULL
     AND p.email IS NOT NULL
     AND LOWER(TRIM(p.email)) = c.normalized_email
     AND p.id <> c.id
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

  IF p_user_id IS NOT NULL THEN
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
      SELECT id INTO v_participant_id
      FROM public.participants
      WHERE group_id = p_group_id
        AND user_id = p_user_id;
    END IF;

    RETURN v_participant_id;
  END IF;

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

CREATE OR REPLACE FUNCTION public.connect_group_participant(
  p_participant_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS UUID AS $$
DECLARE
  v_participant RECORD;
  v_user_email TEXT;
  v_canonical_participant_id UUID;
BEGIN
  SELECT *
  INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  SELECT LOWER(TRIM(email))
  INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User email not found';
  END IF;

  v_canonical_participant_id := public.sync_participant_state(
    v_participant.group_id,
    p_user_id,
    COALESCE(v_participant.email, v_user_email),
    p_role,
    'member'
  );

  INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
  VALUES (v_participant.group_id, p_user_id, p_role, 'active', NULL)
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET
    role = CASE
      WHEN public.group_members.role = 'owner' THEN public.group_members.role
      ELSE EXCLUDED.role
    END,
    status = 'active',
    left_at = NULL;

  IF v_canonical_participant_id <> p_participant_id THEN
    PERFORM public.merge_participant_into_canonical(
      v_canonical_participant_id,
      p_participant_id
    );
  END IF;

  RETURN v_canonical_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.connect_group_participant(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.connect_group_participant(UUID, UUID, TEXT) IS
  'Connects an existing group participant to an auth user while preserving transaction, split, and settlement history';

COMMIT;
