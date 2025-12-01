-- Add missing country_code column to profiles (drift fix)
-- Created: 2025-12-01
--
-- This migration is safe to run multiple times and ensures that
-- the public.profiles table has the country_code column expected
-- by the edge functions and mobile app.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2)
  CHECK (country_code IS NULL OR (LENGTH(country_code) = 2 AND country_code ~ '^[A-Z]{2}$'));

COMMENT ON COLUMN public.profiles.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., US, CA, IN) for phone number country selection. Must be exactly 2 uppercase letters if provided.';
