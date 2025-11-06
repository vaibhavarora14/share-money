-- Add user_id column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own transactions
CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own transactions
CREATE POLICY "Users can insert own transactions"
  ON transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own transactions
CREATE POLICY "Users can update own transactions"
  ON transactions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own transactions
CREATE POLICY "Users can delete own transactions"
  ON transactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Update existing transactions to have a default user (optional - for migration)
-- This is commented out as it's better to handle this in application logic
-- UPDATE transactions SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
