-- Add group_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON transactions(group_id);

-- Update RLS policy to allow users to view transactions in their groups
-- Users can view transactions they created OR transactions in groups they belong to
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;

CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    (group_id IS NOT NULL AND group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    ))
  );

-- Update INSERT policy to allow creating transactions in groups
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;

CREATE POLICY "Users can insert own transactions"
  ON transactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    (group_id IS NULL OR group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    ))
  );
