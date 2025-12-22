-- Final Participant Model Cleanup: Drop Legacy Columns
-- Created: 2025-12-21
--
-- This migration drops all legacy columns after the participant-centric 
-- transition has been fully verified.

BEGIN;

-- 1. Drop dependent objects
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS check_split_among_is_array;

-- Drop dependent RLS policies
DROP POLICY IF EXISTS "Users can view settlements in their groups" ON public.settlements;
DROP POLICY IF EXISTS "Users can create settlements as payer or receiver" ON public.settlements;
DROP POLICY IF EXISTS "Users can view transaction history in their groups" ON public.transaction_history;

-- 2. Drop legacy indexes
DROP INDEX IF EXISTS public.idx_transactions_paid_by;
DROP INDEX IF EXISTS public.idx_transactions_split_among;
DROP INDEX IF EXISTS public.idx_transaction_splits_user_id;
DROP INDEX IF EXISTS public.idx_settlements_from_user_id;
DROP INDEX IF EXISTS public.idx_settlements_to_user_id;

-- 3. Drop legacy columns from transactions
ALTER TABLE public.transactions 
  DROP COLUMN IF EXISTS paid_by,
  DROP COLUMN IF EXISTS split_among;

-- 4. Drop legacy columns from transaction_splits
ALTER TABLE public.transaction_splits 
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS email;

-- 5. Drop legacy columns from settlements
ALTER TABLE public.settlements
  DROP COLUMN IF EXISTS from_user_id,
  DROP COLUMN IF EXISTS to_user_id;

-- 6. Recreate RLS policies for settlements using participant-centric logic
CREATE POLICY "Users can view settlements in their groups"
  ON public.settlements
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.participants p 
      WHERE p.user_id = auth.uid() 
      AND (p.id = settlements.from_participant_id OR p.id = settlements.to_participant_id)
    )
  );

CREATE POLICY "Users can create settlements as payer or receiver"
  ON public.settlements
  FOR INSERT
  WITH CHECK (
    -- User must be group member
    group_id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
    AND (
      -- Case 1: Payer is current user
      EXISTS (
        SELECT 1 FROM public.participants p 
        WHERE p.id = settlements.from_participant_id 
        AND p.user_id = auth.uid()
      )
      OR
      -- Case 2: Receiver is current user
      EXISTS (
        SELECT 1 FROM public.participants p 
        WHERE p.id = settlements.to_participant_id 
        AND p.user_id = auth.uid()
      )
    )
  );

-- 7. Recreate RLS policy for transaction_history
CREATE POLICY "Users can view transaction history in their groups"
  ON public.transaction_history
  FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
    )
    OR transaction_id IN (
      SELECT t.id FROM public.transactions t WHERE t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.settlements s
      JOIN public.participants p ON (p.id = s.from_participant_id OR p.id = s.to_participant_id)
      WHERE s.id = transaction_history.settlement_id
      AND p.user_id = auth.uid()
    )
  );

COMMIT;
