-- Fix type mismatch mechanism in get_group_info_from_token
-- The groups.name column is varchar(255) but the function returns TEXT, causing a 42804 error.

CREATE OR REPLACE FUNCTION get_group_info_from_token(
  p_token UUID
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
    g.name::TEXT, -- Explicitly cast to TEXT
    (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id),
    TRUE
  FROM groups g
  WHERE g.id = v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant permissions to ensure anonymous users can call this function
GRANT EXECUTE ON FUNCTION get_group_info_from_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_info_from_token(UUID) TO anon;
