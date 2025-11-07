-- Add currency column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);

-- Add currency to groups table (optional - for group-level currency preference)
ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
