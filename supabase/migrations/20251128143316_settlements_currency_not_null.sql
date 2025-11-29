-- Make settlements.currency not nullable and remove default
-- Created: 2025-11-28

ALTER TABLE settlements ALTER COLUMN currency DROP DEFAULT;

UPDATE settlements
SET currency = 'USD'
WHERE currency IS NULL;

ALTER TABLE settlements ALTER COLUMN currency SET NOT NULL;
