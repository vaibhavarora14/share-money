-- Admin-free groups: relax member management, block group deletion, add audit logging

-- 1) Simplify member removal RPC (member-only check, no owner logic, soft leave)
CREATE OR REPLACE FUNCTION remove_group_member(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  target_membership RECORD;
  caller_membership RECORD;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Ensure caller is a member
  SELECT id INTO caller_membership
  FROM group_members
  WHERE group_id = p_group_id
    AND user_id = current_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You must be an active member of the group to manage members';
  END IF;

  -- Lock the target membership row
  SELECT role, status INTO target_membership
  FROM group_members
  WHERE group_id = p_group_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of this group';
  END IF;

  -- Soft leave: mark inactive and timestamp
  UPDATE group_members
  SET status = 'left',
      left_at = NOW()
  WHERE group_id = p_group_id
    AND user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Block DELETE on groups at DB layer
CREATE OR REPLACE FUNCTION prevent_group_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Group deletion is disabled';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_group_delete ON groups;
CREATE TRIGGER trg_prevent_group_delete
BEFORE DELETE ON groups
FOR EACH ROW
EXECUTE FUNCTION prevent_group_delete();

-- 2b) Ensure group_members has status/left_at for soft leave
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE group_members
      ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'group_members' AND column_name = 'left_at'
  ) THEN
    ALTER TABLE group_members
      ADD COLUMN left_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3) Group activity audit trail for membership and invitations
CREATE TABLE IF NOT EXISTS group_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_id UUID,
  target_user_id UUID,
  target_email TEXT,
  action TEXT NOT NULL CHECK (action IN (
    'member_added',
    'member_removed',
    'invite_created',
    'invite_cancelled',
    'invite_accepted'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_activity_group_created_at
  ON group_activity(group_id, created_at DESC);

-- Trigger: log membership changes
CREATE OR REPLACE FUNCTION log_group_member_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO group_activity (
      group_id,
      actor_id,
      target_user_id,
      action,
      metadata
    ) VALUES (
      NEW.group_id,
      COALESCE(auth.uid(), NEW.user_id),
      NEW.user_id,
      'member_added',
      jsonb_build_object('role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO group_activity (
      group_id,
      actor_id,
      target_user_id,
      action,
      metadata
    ) VALUES (
      OLD.group_id,
      COALESCE(auth.uid(), OLD.user_id),
      OLD.user_id,
      'member_removed',
      jsonb_build_object('role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_members_activity ON group_members;
CREATE TRIGGER trg_group_members_activity
AFTER INSERT OR DELETE ON group_members
FOR EACH ROW
EXECUTE FUNCTION log_group_member_activity();

-- Trigger: log invitation changes
CREATE OR REPLACE FUNCTION log_group_invitation_activity()
RETURNS TRIGGER AS $$
DECLARE
  actor UUID;
BEGIN
  actor := COALESCE(auth.uid(), NEW.invited_by);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO group_activity (
      group_id,
      actor_id,
      target_email,
      action,
      metadata
    ) VALUES (
      NEW.group_id,
      actor,
      LOWER(NEW.email),
      'invite_created',
      jsonb_build_object('status', NEW.status, 'invitation_id', NEW.id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'cancelled' THEN
        INSERT INTO group_activity (
          group_id,
          actor_id,
          target_email,
          action,
          metadata
        ) VALUES (
          NEW.group_id,
          actor,
          LOWER(NEW.email),
          'invite_cancelled',
          jsonb_build_object('invitation_id', NEW.id)
        );
      ELSIF NEW.status = 'accepted' THEN
        INSERT INTO group_activity (
          group_id,
          actor_id,
          target_email,
          action,
          metadata
        ) VALUES (
          NEW.group_id,
          actor,
          LOWER(NEW.email),
          'invite_accepted',
          jsonb_build_object('invitation_id', NEW.id)
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_invitations_activity ON group_invitations;
CREATE TRIGGER trg_group_invitations_activity
AFTER INSERT OR UPDATE ON group_invitations
FOR EACH ROW
EXECUTE FUNCTION log_group_invitation_activity();


