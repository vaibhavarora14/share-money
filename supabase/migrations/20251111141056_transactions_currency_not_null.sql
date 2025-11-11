-- Make transactions.currency not nullable and remove default
-- Created: 2025-11-11

ALTER TABLE transactions ALTER COLUMN currency DROP DEFAULT;

UPDATE transactions
SET currency = 'INR'
WHERE currency IS NULL;

ALTER TABLE transactions ALTER COLUMN currency SET NOT NULL;
