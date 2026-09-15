-- Per-user group list visibility: archive + hide (no hard group delete).
-- Archive/hide are membership columns so other members are unaffected.

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_group_members_user_archived_at
  ON public.group_members (user_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_members_user_hidden_at
  ON public.group_members (user_id, hidden_at)
  WHERE hidden_at IS NOT NULL;

-- Re-invite / reactivate resurrects the membership into Active for that user.
CREATE OR REPLACE FUNCTION public.clear_membership_visibility_on_reactivate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    NEW.archived_at := NULL;
    NEW.hidden_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clear_membership_visibility_on_reactivate ON public.group_members;
CREATE TRIGGER trg_clear_membership_visibility_on_reactivate
BEFORE UPDATE OF status ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.clear_membership_visibility_on_reactivate();

-- Soft leave with owner succession when another active member exists.
CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  target_membership RECORD;
  caller_membership RECORD;
  successor_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  SELECT id INTO caller_membership
  FROM public.group_members
  WHERE group_id = p_group_id
    AND user_id = current_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You must be an active member of the group to manage members';
  END IF;

  SELECT role, status INTO target_membership
  FROM public.group_members
  WHERE group_id = p_group_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;

  IF target_membership.status = 'left' THEN
    RETURN TRUE;
  END IF;

  -- Soft leave; clear archive so the row can surface under Former (unless hidden).
  UPDATE public.group_members
  SET status = 'left',
      left_at = NOW(),
      archived_at = NULL
  WHERE group_id = p_group_id
    AND user_id = p_user_id;

  UPDATE public.participants
  SET
    type = 'former',
    left_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE group_id = p_group_id
    AND user_id = p_user_id
    AND type = 'member';

  -- Owner leaves → promote another active member when one exists.
  IF target_membership.role = 'owner' THEN
    SELECT user_id INTO successor_id
    FROM public.group_members
    WHERE group_id = p_group_id
      AND status = 'active'
      AND user_id <> p_user_id
    ORDER BY joined_at ASC
    LIMIT 1
    FOR UPDATE;

    IF successor_id IS NOT NULL THEN
      UPDATE public.group_members
      SET role = 'owner'
      WHERE group_id = p_group_id
        AND user_id = successor_id;

      UPDATE public.group_members
      SET role = 'member'
      WHERE group_id = p_group_id
        AND user_id = p_user_id;

      UPDATE public.participants
      SET role = 'owner', updated_at = CURRENT_TIMESTAMP
      WHERE group_id = p_group_id
        AND user_id = successor_id
        AND type = 'member';

      UPDATE public.participants
      SET role = 'member', updated_at = CURRENT_TIMESTAMP
      WHERE group_id = p_group_id
        AND user_id = p_user_id;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated, service_role;

-- Self-only archive / unarchive / hide (never hard-delete groups).
CREATE OR REPLACE FUNCTION public.update_my_group_membership_visibility(
  p_group_id UUID,
  p_archived BOOLEAN DEFAULT NULL,
  p_hidden BOOLEAN DEFAULT NULL
)
RETURNS public.group_members AS $$
DECLARE
  current_user_id UUID;
  membership public.group_members;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF p_archived IS NULL AND p_hidden IS NULL THEN
    RAISE EXCEPTION 'Provide archived and/or hidden';
  END IF;

  IF p_archived IS NOT NULL AND p_hidden IS NOT NULL THEN
    RAISE EXCEPTION 'Archive and hide cannot be combined in one call';
  END IF;

  SELECT * INTO membership
  FROM public.group_members
  WHERE group_id = p_group_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF membership.hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'Group is already removed from your lists';
  END IF;

  IF p_archived IS NOT NULL THEN
    IF membership.status <> 'active' THEN
      RAISE EXCEPTION 'Only active memberships can be archived or unarchived';
    END IF;

    IF p_archived THEN
      IF membership.archived_at IS NOT NULL THEN
        RETURN membership;
      END IF;
      UPDATE public.group_members
      SET archived_at = NOW()
      WHERE group_id = p_group_id
        AND user_id = current_user_id
      RETURNING * INTO membership;
    ELSE
      IF membership.archived_at IS NULL THEN
        RETURN membership;
      END IF;
      UPDATE public.group_members
      SET archived_at = NULL
      WHERE group_id = p_group_id
        AND user_id = current_user_id
      RETURNING * INTO membership;
    END IF;

    RETURN membership;
  END IF;

  -- Hide: permanent for this user until re-invite (from Archived or Former only).
  IF p_hidden IS TRUE THEN
    IF membership.status = 'active' AND membership.archived_at IS NULL THEN
      RAISE EXCEPTION 'Hide is only available for archived or former groups';
    END IF;

    UPDATE public.group_members
    SET hidden_at = NOW(),
        archived_at = NULL
    WHERE group_id = p_group_id
      AND user_id = current_user_id
    RETURNING * INTO membership;

    RETURN membership;
  END IF;

  RAISE EXCEPTION 'Hide cannot be undone from the app';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.update_my_group_membership_visibility(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_group_membership_visibility(uuid, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.clear_membership_visibility_on_reactivate() FROM PUBLIC, anon;
