-- Create a SECURITY DEFINER function to create groups
-- This bypasses RLS for the insert but uses auth.uid() for security
CREATE OR REPLACE FUNCTION create_group(
  group_name VARCHAR(255),
  group_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_group_id UUID;
  current_user_id UUID;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Insert the group with current user as creator
  INSERT INTO groups (name, description, created_by)
  VALUES (group_name, group_description, current_user_id)
  RETURNING id INTO new_group_id;

  -- The trigger will automatically add the creator as owner
  RETURN new_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_group(VARCHAR, TEXT) TO authenticated;
