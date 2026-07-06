-- Configurable invite-link limits (uses + validity)
-- Created: 2026-07-06
--
-- Extends the single-use invite links from 20260706120000 so creators choose
-- how many people a link admits (1-100, default 1) and how long it stays
-- valid (1-90 days, default 7). Defaults preserve the previous behavior.
--
-- Semantics for link invitations (email IS NULL):
--   * status stays 'pending' while uses_count < max_uses (and not expired or
--     cancelled); the redemption that exhausts the link flips status to
--     'accepted' and sets accepted_at.
--   * accepted_by records the MOST RECENT redeemer only. For multi-use links
--     the authoritative audit of who joined is group_members/participants;
--     a per-redemption audit table is intentionally out of scope.
--   * Redemption stays atomic: the row lock serializes concurrent redeems and
--     the pending-status + uses_count checks decide inside the lock.
-- Email invitations are unaffected (max_uses stays NULL).

-- ============================================================================
-- 1. SCHEMA
-- ============================================================================

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS max_uses INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.group_invitations
  DROP CONSTRAINT IF EXISTS group_invitations_max_uses_range;
ALTER TABLE public.group_invitations
  ADD CONSTRAINT group_invitations_max_uses_range
  CHECK (max_uses IS NULL OR (max_uses >= 1 AND max_uses <= 100));

COMMENT ON COLUMN public.group_invitations.max_uses IS
  'Link invites: how many distinct users the link can admit (NULL for email invites)';
COMMENT ON COLUMN public.group_invitations.uses_count IS
  'Link invites: how many users have joined through this link';

-- Existing link invites keep single-use behavior.
UPDATE public.group_invitations
SET max_uses = 1
WHERE email IS NULL AND max_uses IS NULL;

-- ============================================================================
-- 2. CREATE LINK (new signature; drop the old one to avoid RPC overload
--    ambiguity in PostgREST)
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_group_share_link(UUID);

CREATE OR REPLACE FUNCTION public.create_group_share_link(
  p_group_id UUID,
  p_max_uses INTEGER DEFAULT 1,
  p_valid_days INTEGER DEFAULT 7
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_token TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_max_uses IS NULL OR p_max_uses < 1 OR p_max_uses > 100 THEN
    RAISE EXCEPTION 'max uses must be between 1 and 100';
  END IF;

  IF p_valid_days IS NULL OR p_valid_days < 1 OR p_valid_days > 90 THEN
    RAISE EXCEPTION 'validity must be between 1 and 90 days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_uid
      AND gm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active group members can create invite links';
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO public.group_invitations
    (group_id, email, invited_by, token, status, expires_at, max_uses)
  VALUES (
    p_group_id,
    NULL,
    v_uid,
    v_token,
    'pending',
    CURRENT_TIMESTAMP + make_interval(days => p_valid_days),
    p_max_uses
  );

  RETURN v_token;
END;
$$;

-- ============================================================================
-- 3. PREVIEW (adds remaining uses + expiry; return type change requires drop)
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_group_invite_preview(TEXT);

CREATE FUNCTION public.get_group_invite_preview(p_token TEXT)
RETURNS TABLE (
  group_name TEXT,
  member_count BIGINT,
  is_valid BOOLEAN,
  remaining_uses INTEGER,
  expires_at TIMESTAMP
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT gi.group_id, gi.max_uses, gi.uses_count, gi.expires_at AS inv_expires_at
  INTO v_inv
  FROM public.group_invitations gi
  WHERE gi.token = p_token
    AND gi.email IS NULL
    AND gi.status = 'pending'
    AND gi.expires_at > CURRENT_TIMESTAMP;

  IF v_inv.group_id IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::BIGINT, FALSE, NULL::INTEGER, NULL::TIMESTAMP;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.name::TEXT,
    (SELECT COUNT(*) FROM public.group_members gm
      WHERE gm.group_id = g.id AND gm.status = 'active'),
    TRUE,
    GREATEST(COALESCE(v_inv.max_uses, 1) - v_inv.uses_count, 0),
    v_inv.inv_expires_at
  FROM public.groups g
  WHERE g.id = v_inv.group_id;
END;
$$;

-- ============================================================================
-- 4. REDEEM (atomic row-locked increment; exhaustion closes the link)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_group_invite_link(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_inv RECORD;
  v_group_name TEXT;
  v_max_uses INTEGER;
  v_new_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Serialize concurrent redeems on the invitation row.
  SELECT * INTO v_inv
  FROM public.group_invitations
  WHERE token = p_token
    AND email IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_inv.group_id;

  -- Already an active member: never consumes a use.
  IF EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = v_inv.group_id
      AND gm.user_id = v_uid
      AND gm.status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_member',
      'group_id', v_inv.group_id,
      'group_name', v_group_name
    );
  END IF;

  v_max_uses := COALESCE(v_inv.max_uses, 1);

  IF v_inv.status <> 'pending' OR v_inv.uses_count >= v_max_uses THEN
    RAISE EXCEPTION 'This invite link has already been used or cancelled';
  END IF;

  IF v_inv.expires_at < CURRENT_TIMESTAMP THEN
    -- Return (not RAISE): raising would roll back this status update.
    UPDATE public.group_invitations SET status = 'expired' WHERE id = v_inv.id;
    RETURN jsonb_build_object(
      'status', 'expired',
      'group_id', v_inv.group_id,
      'group_name', v_group_name
    );
  END IF;

  PERFORM public.sync_participant_state(v_inv.group_id, v_uid, NULL, 'member', 'member');

  INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
  VALUES (v_inv.group_id, v_uid, 'member', 'active', NULL)
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET
    role = CASE
      WHEN public.group_members.role = 'owner' THEN public.group_members.role
      ELSE EXCLUDED.role
    END,
    status = 'active',
    left_at = NULL;

  v_new_count := v_inv.uses_count + 1;

  UPDATE public.group_invitations
  SET uses_count = v_new_count,
      accepted_by = v_uid,
      status = CASE WHEN v_new_count >= v_max_uses THEN 'accepted' ELSE status END,
      accepted_at = CASE WHEN v_new_count >= v_max_uses THEN CURRENT_TIMESTAMP ELSE accepted_at END
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'status', 'joined',
    'group_id', v_inv.group_id,
    'group_name', v_group_name,
    'remaining_uses', GREATEST(v_max_uses - v_new_count, 0)
  );
END;
$$;

-- ============================================================================
-- 5. GRANTS (drops removed the old ones)
-- ============================================================================

REVOKE ALL ON FUNCTION public.create_group_share_link(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_share_link(UUID, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_group_invite_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_group_invite_link(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_group_invite_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_invite_preview(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.create_group_share_link(UUID, INTEGER, INTEGER) IS
  'Creates a group invite link admitting up to p_max_uses users (1-100, default 1), valid p_valid_days days (1-90, default 7); returns the secret token';
COMMENT ON FUNCTION public.redeem_group_invite_link(TEXT) IS
  'Atomically redeems an invite link for the calling user; increments uses_count under a row lock and closes the link when exhausted';
