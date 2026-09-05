-- Allow group members to delete unlinked people with no remaining history.
-- Linked accounts are soft-removed via remove_group_member and must not be
-- hard-deleted, so this policy is limited to user_id IS NULL.

BEGIN;

DROP POLICY IF EXISTS "Users can delete unlinked participants in their groups"
  ON public.participants;

CREATE POLICY "Users can delete unlinked participants in their groups"
  ON public.participants
  FOR DELETE
  USING (
    user_id IS NULL
    AND (
      group_id IN (
        SELECT group_id FROM public.group_members
        WHERE user_id = auth.uid()
      )
      OR group_id IN (
        SELECT id FROM public.groups WHERE created_by = auth.uid()
      )
    )
  );

COMMIT;
