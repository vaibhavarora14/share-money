-- Initial Schema Migration
-- This migration consolidates all previous migrations into a single initial schema
-- Created: 2025-01-10

-- ============================================================================
-- GROUPS TABLE (must be created before transactions due to foreign key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for groups
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);

-- Enable Row Level Security for groups
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- GROUP MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
);

-- Indexes for group_members
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Enable Row Level Security for group_members
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRANSACTIONS TABLE (created after groups due to foreign key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  category VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);

-- Enable Row Level Security for transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    (group_id IS NOT NULL AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert own transactions"
  ON transactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    (group_id IS NULL OR group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can update own transactions"
  ON transactions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to bypass RLS recursion)
-- ============================================================================

-- Function to check if user is a group member (bypasses RLS)
CREATE OR REPLACE FUNCTION is_user_group_member(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id AND user_id = check_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is a group owner (bypasses RLS)
CREATE OR REPLACE FUNCTION is_user_group_owner(check_group_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- First check if user created the group
  IF EXISTS (
    SELECT 1 FROM groups
    WHERE id = check_group_id AND created_by = check_user_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Then check if user is an owner member
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = check_group_id 
    AND user_id = check_user_id 
    AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a group (bypasses RLS for insert)
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

-- Function to safely remove a group member (prevents removing last owner)
CREATE OR REPLACE FUNCTION remove_group_member(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_id UUID;
  target_membership RECORD;
  current_user_role VARCHAR(20);
  owner_count INTEGER;
BEGIN
  -- Get the current user ID from auth context
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Get the target user's membership and lock the row
  SELECT role INTO STRICT target_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id
  FOR UPDATE;

  -- Check authorization: users can remove themselves, or owners can remove any member
  IF p_user_id != current_user_id THEN
    -- Check if current user is an owner
    SELECT role INTO current_user_role
    FROM group_members
    WHERE group_id = p_group_id
    AND user_id = current_user_id
    FOR UPDATE;
    
    IF NOT FOUND OR current_user_role != 'owner' THEN
      RAISE EXCEPTION 'Only group owners can remove other members';
    END IF;
  END IF;

  -- If removing an owner, check if it's the last owner (atomic check with lock)
  IF target_membership.role = 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM group_members
    WHERE group_id = p_group_id
    AND role = 'owner'
    FOR UPDATE;

    IF owner_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of the group';
    END IF;
  END IF;

  -- Perform the deletion
  DELETE FROM group_members
  WHERE group_id = p_group_id
  AND user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically add creator as owner when group is created
CREATE OR REPLACE FUNCTION add_group_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to automatically add creator as owner
CREATE TRIGGER add_group_creator_trigger
  AFTER INSERT ON groups
  FOR EACH ROW
  EXECUTE FUNCTION add_group_creator_as_owner();

-- ============================================================================
-- RLS POLICIES FOR GROUPS
-- ============================================================================

-- Users can view groups they created or are members of
CREATE POLICY "Users can view groups they belong to"
  ON groups
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR is_user_group_member(id, auth.uid())
  );

-- Users can create groups
CREATE POLICY "Users can create groups"
  ON groups
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Group owners can update their groups
CREATE POLICY "Group owners can update groups"
  ON groups
  FOR UPDATE
  USING (
    created_by = auth.uid() OR
    id IN (
      SELECT group_id FROM group_members 
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Group owners can delete their groups
CREATE POLICY "Group owners can delete groups"
  ON groups
  FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- RLS POLICIES FOR GROUP MEMBERS
-- ============================================================================

-- Users can view members of groups they created or belong to
CREATE POLICY "Users can view members of their groups"
  ON group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND (
        groups.created_by = auth.uid()
        OR is_user_group_member(group_members.group_id, auth.uid())
      )
    )
  );

-- Group owners can add members
CREATE POLICY "Group owners can add members"
  ON group_members
  FOR INSERT
  WITH CHECK (
    is_user_group_owner(group_id, auth.uid())
  );

-- Group owners can update member roles
CREATE POLICY "Group owners can update member roles"
  ON group_members
  FOR UPDATE
  USING (
    is_user_group_owner(group_id, auth.uid())
  );

-- Users can leave groups or owners can remove members
CREATE POLICY "Users can leave groups or owners can remove members"
  ON group_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_user_group_owner(group_id, auth.uid())
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION create_group(VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_group_owner(UUID, UUID) TO authenticated;

