-- Remove currency column from groups table
-- Groups should be independent of currency - currency is determined by transaction or global default
-- Created: 2025-01-11

-- ============================================================================
-- REMOVE CURRENCY FROM GROUPS TABLE
-- ============================================================================

-- Drop the currency column from groups table
ALTER TABLE groups DROP COLUMN IF EXISTS currency;

