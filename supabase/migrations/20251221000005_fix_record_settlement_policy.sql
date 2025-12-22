-- Fix settlement creation RLS to ensure group members can record payments for others
-- Created: 2025-12-21

BEGIN;

-- Drop potentially conflicting policies to be sure
DROP POLICY IF EXISTS "Users can create settlements as payer or receiver" ON public.settlements;
DROP POLICY IF EXISTS "Group members can record settlements" ON public.settlements;

-- Re-apply the permissive policy
CREATE POLICY "Group members can record settlements"
  ON public.settlements
  FOR INSERT
  WITH CHECK (
    -- Caller must be an active group member
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = settlements.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
    )
  );

COMMIT;
