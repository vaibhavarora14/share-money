-- Final Participant Structure Enforcement
-- Created: 2025-12-21
--
-- This migration populates participant_id for all transactions and splits
-- and enforces NOT NULL constraints.

BEGIN;

-- 1. Ensure all transaction_splits have a participant_id
-- If a split has a user_id or email but no participant_id, resolve it
DO $$
DECLARE
  r RECORD;
  v_participant_id UUID;
BEGIN
  FOR r IN 
    SELECT s.id, t.group_id, s.user_id, s.email 
    FROM public.transaction_splits s
    JOIN public.transactions t ON s.transaction_id = t.id
    WHERE s.participant_id IS NULL
  LOOP
    v_participant_id := public.sync_participant_state(r.group_id, r.user_id, r.email);
    
    UPDATE public.transaction_splits 
    SET participant_id = v_participant_id 
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 2. Ensure all transactions have a paid_by_participant_id
DO $$
DECLARE
  r RECORD;
  v_participant_id UUID;
BEGIN
  FOR r IN 
    SELECT id, group_id, paid_by 
    FROM public.transactions 
    WHERE paid_by_participant_id IS NULL
  LOOP
    -- paid_by is a UUID string (user_id)
    v_participant_id := public.sync_participant_state(r.group_id, CAST(r.paid_by AS UUID), NULL);
    
    UPDATE public.transactions 
    SET paid_by_participant_id = v_participant_id 
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 3. Ensure all settlements have participant IDs
DO $$
DECLARE
  r RECORD;
  v_from_participant_id UUID;
  v_to_participant_id UUID;
BEGIN
  FOR r IN 
    SELECT id, group_id, from_user_id, to_user_id 
    FROM public.settlements 
    WHERE from_participant_id IS NULL OR to_participant_id IS NULL
  LOOP
    v_from_participant_id := public.sync_participant_state(r.group_id, r.from_user_id, NULL);
    v_to_participant_id := public.sync_participant_state(r.group_id, r.to_user_id, NULL);
    
    UPDATE public.settlements 
    SET 
      from_participant_id = v_from_participant_id,
      to_participant_id = v_to_participant_id
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 4. Enforce NOT NULL constraints
ALTER TABLE public.transaction_splits 
  ALTER COLUMN participant_id SET NOT NULL;

ALTER TABLE public.transactions 
  ALTER COLUMN paid_by_participant_id SET NOT NULL;

ALTER TABLE public.settlements
  ALTER COLUMN from_participant_id SET NOT NULL,
  ALTER COLUMN to_participant_id SET NOT NULL;

-- 5. Mark legacy columns as nullable (if they weren't) to prepare for removal
ALTER TABLE public.transactions 
  ALTER COLUMN paid_by DROP NOT NULL;

-- Note: We wait to DROP columns until the API and Frontend are fully updated.

COMMIT;
