-- Cleanup Migration: Drop Mapping Table
-- Created: 2025-01-23
--
-- This migration cleans up the temporary participant_mapping table used during migration.
-- This can be run after verifying the migration was successful.

-- ============================================================================
-- DROP MAPPING TABLE
-- ============================================================================

DROP TABLE IF EXISTS participant_mapping;


