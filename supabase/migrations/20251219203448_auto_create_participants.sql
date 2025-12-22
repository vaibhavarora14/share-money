-- Auto-create Participants for New Members and Invitations
-- Created: 2025-01-23
--
-- This migration creates triggers to automatically create participants when:
-- 1. A new group_member is added
-- 2. A new group_invitation is created

-- ============================================================================
-- TRIGGER: Auto-create participant when group_member is added
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_participant_for_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if status column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    -- Status column exists - use it
    INSERT INTO participants (group_id, user_id, type, role, joined_at, created_at, updated_at)
    VALUES (
      NEW.group_id,
      NEW.user_id,
      CASE 
        WHEN NEW.status = 'left' THEN 'former'
        ELSE 'member'
      END,
      NEW.role,
      NEW.joined_at,
      NEW.joined_at,
      COALESCE(NEW.left_at, NEW.joined_at)
    )
    ON CONFLICT DO NOTHING;
  ELSE
    -- Status column doesn't exist - all are members
    INSERT INTO participants (group_id, user_id, type, role, joined_at, created_at, updated_at)
    VALUES (
      NEW.group_id,
      NEW.user_id,
      'member',
      NEW.role,
      NEW.joined_at,
      NEW.joined_at,
      NEW.joined_at
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_participant_for_member ON group_members;
CREATE TRIGGER trg_auto_create_participant_for_member
  AFTER INSERT ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_participant_for_member();

-- ============================================================================
-- TRIGGER: Auto-create participant when group_invitation is created
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_participant_for_invitation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create participant for pending invitations
  IF NEW.status = 'pending' THEN
    INSERT INTO participants (group_id, email, type, created_at, updated_at)
    VALUES (
      NEW.group_id,
      NEW.email,
      'invited',
      NEW.created_at,
      NEW.created_at
    )
    ON CONFLICT DO NOTHING; -- Use unique index to prevent duplicates
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_participant_for_invitation ON group_invitations;
CREATE TRIGGER trg_auto_create_participant_for_invitation
  AFTER INSERT ON group_invitations
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION auto_create_participant_for_invitation();

-- ============================================================================
-- TRIGGER: Update participant when group_member status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_update_participant_for_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Update participant type when member status changes (if status column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'group_members' AND column_name = 'status'
  ) THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      UPDATE participants
      SET 
        type = CASE 
          WHEN NEW.status = 'left' THEN 'former'
          ELSE 'member'
        END,
        left_at = CASE 
          WHEN NEW.status = 'left' THEN COALESCE(NEW.left_at, CURRENT_TIMESTAMP)
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE group_id = NEW.group_id
        AND user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_update_participant_for_member ON group_members;
CREATE TRIGGER trg_auto_update_participant_for_member
  AFTER UPDATE ON group_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_participant_for_member();


