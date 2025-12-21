-- Allow group members to record settlements for anyone in the group
-- Created: 2025-12-21

BEGIN;

-- 1. Drop the restrictive insert policy
DROP POLICY IF EXISTS "Users can create settlements as payer or receiver" ON public.settlements;

-- 2. Create a new, collaborative policy
-- This allows any active group member to record a settlement record in their group.
-- This is necessary for:
--   a) Admins recording settlements for others
--   b) Group members recording payments for invited users (who have no user_id)
--   c) Collaborative debt management
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
    -- Participants must both belong to the same group as the settlement
    AND EXISTS (
      SELECT 1 FROM public.participants p_from
      WHERE p_from.id = settlements.from_participant_id
        AND p_from.group_id = settlements.group_id
    )
    AND EXISTS (
      SELECT 1 FROM public.participants p_to
      WHERE p_to.id = settlements.to_participant_id
        AND p_to.group_id = settlements.group_id
    )
  );

COMMIT;
