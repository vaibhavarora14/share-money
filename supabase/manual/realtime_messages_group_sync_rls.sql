-- Manual: Realtime Authorization for private group-sync channels
-- File: supabase/manual/realtime_messages_group_sync_rls.sql
--
-- WHY THIS IS NOT A MIGRATION
-- ---------------------------
-- `supabase db push` (including GitHub Actions) runs as a role that can alter
-- public-schema objects but is NOT the owner of `realtime.messages`. Applying
-- ALTER TABLE / CREATE POLICY on that table fails with:
--   ERROR: must be owner of table messages (SQLSTATE 42501)
--
-- HOW TO APPLY
-- ------------
-- 1. Open the Supabase Dashboard → SQL Editor (project owner / privileged role).
-- 2. Paste and run this entire file.
-- 3. In Realtime Settings, ensure private channels / authorization are enabled
--    (disable "Allow public access" if you want private-only enforcement).
-- 4. Confirm clients subscribe with `config: { private: true }` and edge
--    broadcasts send `private: true` (already wired in this PR).
--
-- Until this is applied, private `group-sync:<groupId>` subscriptions may be
-- rejected or receive nothing. CDC on transactions/settlements and id-only
-- DATA_MUTATED semantics still depend on the auto migration succeeding; this
-- file only gates Broadcast Authorization on realtime.messages.
--
-- Idempotent: safe to re-run.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_can_receive_group_sync_broadcast"
  ON realtime.messages;

CREATE POLICY "group_members_can_receive_group_sync_broadcast"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.user_id = (SELECT auth.uid())
        AND COALESCE(gm.status, 'active') = 'active'
        AND (SELECT realtime.topic()) = ('group-sync:' || gm.group_id::text)
    )
  );

-- Clients never publish on this topic (edge/service role broadcasts).
-- With RLS enabled and no INSERT policy for authenticated, INSERT is denied.
DROP POLICY IF EXISTS "deny_authenticated_group_sync_broadcast_send"
  ON realtime.messages;
