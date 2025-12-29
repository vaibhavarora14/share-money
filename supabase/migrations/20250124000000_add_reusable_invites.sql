-- Migration for Reusable Group Invitations
-- This migration updates the group_invitations table to support public, reusable links
-- and adds necessary RPC functions.

-- ============================================================================
-- 1. SCHEMA CHANGES
-- ============================================================================

-- Make email nullable to support public links where we don't know the email yet
ALTER TABLE group_invitations ALTER COLUMN email DROP NOT NULL;

-- Add tracking for usage
ALTER TABLE group_invitations 
ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE group_invitations 
ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT NULL; -- NULL means infinite/unlimited

-- ============================================================================
-- 2. RPC FUNCTIONS
-- ============================================================================

-- Function to create a reusable share link
CREATE OR REPLACE FUNCTION create_group_share_link(
  p_group_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_invite_id UUID;
BEGIN
  -- Check if user is owner/member with permission (Assuming owners for now based on previous policy)
  -- Policy check handles 'INSERT', but strict logic:
  IF NOT is_user_group_owner(p_group_id, auth.uid()) THEN
      RAISE EXCEPTION 'Only group owners can create share links';
  END IF;

  INSERT INTO group_invitations (
    group_id,
    email,
    invited_by,
    status,
    max_uses,
    expires_at
  ) VALUES (
    p_group_id,
    NULL, -- Public link
    auth.uid(),
    'pending',
    NULL, -- Infinite uses for now, or could be passed as arg
    (CURRENT_TIMESTAMP + INTERVAL '7 days')
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to get group info from a token (for preview)
CREATE OR REPLACE FUNCTION get_group_info_from_token(
  p_token UUID -- Using ID as token for simplicity, or we could add a separate token col if ID is exposed
)
RETURNS TABLE (
  group_name TEXT,
  member_count BIGINT,
  is_valid BOOLEAN
) AS $$
DECLARE
  v_group_id UUID;
BEGIN
  SELECT group_id INTO v_group_id
  FROM group_invitations
  WHERE id = p_token
  AND status = 'pending'
  AND expires_at > CURRENT_TIMESTAMP;

  IF v_group_id IS NULL THEN
    RETURN QUERY SELECT 
      NULL::TEXT, 
      NULL::BIGINT, 
      FALSE;
    RETURN;
  END IF;

  RETURN QUERY SELECT 
    g.name,
    (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id),
    TRUE
  FROM groups g
  WHERE g.id = v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Updated accept function to handle reusable invites
CREATE OR REPLACE FUNCTION accept_group_invitation(
  invitation_id UUID,
  accepting_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  invitation_record RECORD;
  current_user_email TEXT;
  v_already_member BOOLEAN;
BEGIN
  -- Get the current user's email from auth context
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = accepting_user_id;

  IF current_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Get and lock the invitation
  SELECT * INTO invitation_record
  FROM group_invitations
  WHERE id = invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Logic Split: Targeted Email vs Public Link
  
  -- 1. Targeted Email Validation
  IF invitation_record.email IS NOT NULL THEN
    IF LOWER(invitation_record.email) != LOWER(current_user_email) THEN
      RAISE EXCEPTION 'This invitation is not for your email address';
    END IF;
  END IF;

  -- 2. General Validations
  IF invitation_record.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid (status: %)', invitation_record.status;
  END IF;

  IF invitation_record.expires_at < CURRENT_TIMESTAMP THEN
     -- Mark as expired if it's a one-time invite or if we want to clean up
     -- For reusable, we just check timestamp
    UPDATE group_invitations SET status = 'expired' WHERE id = invitation_id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- 3. Max Uses Validation
  IF invitation_record.max_uses IS NOT NULL AND invitation_record.uses_count >= invitation_record.max_uses THEN
     UPDATE group_invitations SET status = 'expired' WHERE id = invitation_id;
     RAISE EXCEPTION 'Invitation has reached maximum uses';
  END IF;

  -- 4. Check Member Status
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = invitation_record.group_id
    AND user_id = accepting_user_id
  ) INTO v_already_member;

  IF v_already_member THEN
      -- User is already valid, just return true.
      -- If it's a targeted one-time invite, we mark accepted. 
      -- If reusable, we do nothing to the invite.
      IF invitation_record.email IS NOT NULL THEN
          UPDATE group_invitations
          SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
          WHERE id = invitation_id;
      END IF;
      RETURN TRUE;
  END IF;

  -- 5. Add User
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (invitation_record.group_id, accepting_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- 6. Update Invitation Status
  IF invitation_record.email IS NOT NULL THEN
     -- One-time targeted: Mark accepted
     UPDATE group_invitations
     SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
     WHERE id = invitation_id;
  ELSE
     -- Reusable: Increment count
     UPDATE group_invitations
     SET uses_count = uses_count + 1
     WHERE id = invitation_id;
     
     -- Check if we hit limit after this use
     IF invitation_record.max_uses IS NOT NULL AND (invitation_record.uses_count + 1) >= invitation_record.max_uses THEN
         UPDATE group_invitations
         SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP -- Or 'expired'? 'accepted' implies fully used up.
         WHERE id = invitation_id;
     END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 3. RLS UPDATES
-- ============================================================================

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_group_share_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_info_from_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_info_from_token(UUID) TO anon; -- Allow anon to preview before login?
GRANT EXECUTE ON FUNCTION accept_group_invitation(UUID, UUID) TO authenticated;
