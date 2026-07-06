-- Shareable single-use group invite links
-- Created: 2026-07-06
-- Revives draft PR #120 (feat/add-group-invite-link), reworked for the current
-- unified participant model and for strict single-use semantics:
--   * one link <-> one group_invitations row (email IS NULL marks a link invite)
--   * redemption is atomic (row lock + pending-status guard), so a link can
--     only ever admit one person
--   * links expire after 7 days and can be revoked via the existing
--     cancel-invitation flow
--
-- Differences from the draft:
--   * no uses_count/max_uses columns (single-use maps onto the existing
--     pending -> accepted lifecycle)
--   * accept_group_invitation() is left untouched (the draft predated
--     sync_participant_state and would have regressed it); link redemption
--     gets its own RPC keyed on the secret token and auth.uid()
--   * link tokens use the existing token column (256-bit hex), not the row id

-- ============================================================================
-- 1. SCHEMA
-- ============================================================================

-- Link invites have no target email until someone redeems them.
ALTER TABLE public.group_invitations ALTER COLUMN email DROP NOT NULL;

-- Audit: which user consumed the invitation (useful for single-use links).
ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.group_invitations.accepted_by IS
  'User who accepted/redeemed the invitation (set on acceptance; NULL for legacy rows)';

-- ============================================================================
-- 2. CREATE LINK
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_group_share_link(p_group_id UUID)
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

  -- Any active group member may create an invite link (same policy as
  -- email invitations, see 20251220000000_allow_members_to_create_invitations).
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_uid
      AND gm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active group members can create invite links';
  END IF;

  -- 64 hex chars (~244 bits of entropy) using core gen_random_uuid(),
  -- avoiding a pgcrypto dependency. Same shape as email-invite tokens.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO public.group_invitations (group_id, email, invited_by, token, status, expires_at)
  VALUES (
    p_group_id,
    NULL,                -- email-less row identifies a link invite
    v_uid,
    v_token,
    'pending',
    CURRENT_TIMESTAMP + INTERVAL '7 days'
  );

  RETURN v_token;
END;
$$;

-- ============================================================================
-- 3. PREVIEW (safe for logged-out link holders: name + member count only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_group_invite_preview(p_token TEXT)
RETURNS TABLE (
  group_name TEXT,
  member_count BIGINT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  SELECT gi.group_id INTO v_group_id
  FROM public.group_invitations gi
  WHERE gi.token = p_token
    AND gi.email IS NULL              -- link invites only
    AND gi.status = 'pending'
    AND gi.expires_at > CURRENT_TIMESTAMP;

  IF v_group_id IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::BIGINT, FALSE;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.name::TEXT,
    (SELECT COUNT(*) FROM public.group_members gm
      WHERE gm.group_id = g.id AND gm.status = 'active'),
    TRUE
  FROM public.groups g
  WHERE g.id = v_group_id;
END;
$$;

-- ============================================================================
-- 4. REDEEM (atomic, single-use, server-side authorization via auth.uid())
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the invitation row: concurrent redeems serialize here, and only the
  -- first one sees status = 'pending'.
  SELECT * INTO v_inv
  FROM public.group_invitations
  WHERE token = p_token
    AND email IS NULL                 -- link invites only; email invites keep
                                      -- their email-match acceptance flow
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  SELECT g.name INTO v_group_name FROM public.groups g WHERE g.id = v_inv.group_id;

  -- Already an active member: don't consume the link (it can still be used
  -- by the person it was actually meant for).
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

  IF v_inv.status <> 'pending' THEN
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

  -- Keep participants in sync (merges any email participant by auth email,
  -- reactivates former members) before creating the membership.
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

  -- Consume the link only after membership succeeded.
  UPDATE public.group_invitations
  SET status = 'accepted',
      accepted_at = CURRENT_TIMESTAMP,
      accepted_by = v_uid
  WHERE id = v_inv.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'status', 'joined',
    'group_id', v_inv.group_id,
    'group_name', v_group_name
  );
END;
$$;

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

REVOKE ALL ON FUNCTION public.create_group_share_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_share_link(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_group_invite_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_group_invite_link(TEXT) TO authenticated;

-- Preview is intentionally available pre-login (link holder sees group name
-- and member count only; the 256-bit token is the access credential).
REVOKE ALL ON FUNCTION public.get_group_invite_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_invite_preview(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.create_group_share_link(UUID) IS
  'Creates a single-use, 7-day group invite link (email-less group_invitations row); returns the secret token';
COMMENT ON FUNCTION public.get_group_invite_preview(TEXT) IS
  'Public preview (group name + active member count) for a valid pending invite-link token';
COMMENT ON FUNCTION public.redeem_group_invite_link(TEXT) IS
  'Atomically redeems a single-use invite link for the calling user, syncing participants and membership';
