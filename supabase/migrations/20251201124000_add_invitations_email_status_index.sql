-- Add composite index for invitation lookup by email and status
-- Created: 2025-12-01
--
-- This migration adds a composite partial index to optimize the query in
-- handle_new_user() trigger that looks up pending invitations by email.
-- The index covers the exact query pattern: LOWER(email) and status = 'pending'
--
-- Performance benefit: Significantly speeds up invitation lookup during user signup,
-- especially when there are many invitations in the system.

CREATE INDEX IF NOT EXISTS idx_group_invitations_email_status_pending 
ON group_invitations(LOWER(email), status) 
WHERE status = 'pending';
