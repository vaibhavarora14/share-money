-- Add constraint to ensure split_among is always an array or null
-- Created: 2025-01-12

-- ============================================================================
-- ADD CONSTRAINT FOR split_among
-- ============================================================================

-- First, clean up any invalid data (shouldn't exist, but safety first)
UPDATE transactions
SET split_among = '[]'::jsonb
WHERE split_among IS NOT NULL 
  AND jsonb_typeof(split_among) != 'array';

-- Add constraint to ensure split_among is always an array or null
ALTER TABLE transactions
ADD CONSTRAINT check_split_among_is_array 
CHECK (
  split_among IS NULL 
  OR jsonb_typeof(split_among) = 'array'
);

-- Add comment
COMMENT ON CONSTRAINT check_split_among_is_array ON transactions IS 
'Ensures split_among is always a JSONB array or null';
