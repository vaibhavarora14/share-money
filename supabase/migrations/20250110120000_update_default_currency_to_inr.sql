-- Update Default Currency Migration
-- This migration updates the default currency from USD to INR for existing tables
-- Created: 2025-01-10

-- ============================================================================
-- UPDATE DEFAULT CURRENCY FOR GROUPS TABLE
-- ============================================================================

-- Alter the default value for currency column in groups table
ALTER TABLE groups 
ALTER COLUMN currency SET DEFAULT 'INR';

-- ============================================================================
-- UPDATE DEFAULT CURRENCY FOR TRANSACTIONS TABLE
-- ============================================================================

-- Alter the default value for currency column in transactions table
ALTER TABLE transactions 
ALTER COLUMN currency SET DEFAULT 'INR';
