-- Unified Participant Management
-- Created: 2025-12-21
--
-- This migration unifies the management of participants and group members.
-- It establishes a single source of truth for participant transitions.

-- ============================================================================
-- 1. UNIFIED STATE SYNC FUNCTION
-- ============================================================================

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

  -- 1. Try to find existing participant
  IF p_user_id IS NOT NULL THEN
    -- Try by user_id first
    SELECT id INTO v_participant_id FROM public.participants 
    WHERE group_id = p_group_id AND user_id = p_user_id;
  END IF;

  IF v_participant_id IS NULL AND v_normalized_email IS NOT NULL THEN
    -- Try by email
    SELECT id INTO v_participant_id FROM public.participants 
    WHERE group_id = p_group_id AND LOWER(email) = v_normalized_email;
  END IF;

  -- 2. Create or Update
  IF v_participant_id IS NOT NULL THEN
    UPDATE public.participants
    SET 
      user_id = COALESCE(user_id, p_user_id),
      email = CASE WHEN p_user_id IS NOT NULL THEN NULL ELSE COALESCE(email, v_normalized_email) END,
      type = p_target_type,
      role = COALESCE(p_role, role),
      left_at = CASE WHEN p_target_type = 'former' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_participant_id;
  ELSE
    INSERT INTO public.participants (group_id, user_id, email, type, role, joined_at)
    VALUES (
      p_group_id, 
      p_user_id, 
      CASE WHEN p_user_id IS NOT NULL THEN NULL ELSE v_normalized_email END, 
      p_target_type, 
      p_role, 
      CASE WHEN p_target_type = 'member' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    RETURNING id INTO v_participant_id;
  END IF;

  RETURN v_participant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. UPDATE TRIGGER FUNCTIONS TO USE THE UNIFIED RPC
-- ============================================================================

-- Function: Auto-create participant when group_member is added
CREATE OR REPLACE FUNCTION public.auto_create_participant_for_member()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.sync_participant_state(
    NEW.group_id, 
    NEW.user_id, 
    NULL, 
    NEW.role, 
    CASE WHEN NEW.status = 'left' THEN 'former' ELSE 'member' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Auto-update participant when group_member status changes
CREATE OR REPLACE FUNCTION public.auto_update_participant_for_member()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.sync_participant_state(
      NEW.group_id, 
      NEW.user_id, 
      NULL, 
      NEW.role, 
      CASE WHEN NEW.status = 'left' THEN 'former' ELSE 'member' END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Auto-create participant when group_invitation is created
CREATE OR REPLACE FUNCTION public.auto_create_participant_for_invitation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.sync_participant_state(NEW.group_id, NULL, NEW.email, 'member', 'invited');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. RE-IMPLEMENT ACCEPT INVITATION TO USE UNIFIED RPC
-- ============================================================================

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

  -- 4. Sync Participant & Create Membership
  -- The trigger on group_members will call sync_participant_state for us,
  -- but we call it explicitly here to handle the email -> user_id link properly.
  PERFORM public.sync_participant_state(v_invitation.group_id, accepting_user_id, NULL, 'member', 'member');

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invitation.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active', left_at = NULL;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
