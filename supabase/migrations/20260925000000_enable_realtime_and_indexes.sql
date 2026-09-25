-- Enable Realtime Replication & Composite Indexes for High-Performance Queries
-- Migration: 20260925000000_enable_realtime_and_indexes.sql

-- 1. Composite performance indexes for feed queries and cursor pagination
CREATE INDEX IF NOT EXISTS idx_transactions_group_date_id
  ON transactions (group_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_group_created_id
  ON transactions (group_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_settlements_group_created
  ON settlements (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_composite
  ON transaction_splits (transaction_id, participant_id);

-- 2. Add core tables to supabase_realtime publication for client replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE settlements;
  END IF;
END $$;

-- 3. REPLICA IDENTITY FULL so filtered DELETE CDC can evaluate non-PK columns
--    (e.g. group_id=eq.<uuid>). Default replica identity only includes PKs, so
--    Realtime cannot match DELETE filters on group_id and clients never see them.
--    Safe / idempotent: re-running sets the same identity.
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.settlements REPLICA IDENTITY FULL;

-- 4. Private broadcast authorization for group-sync:<groupId> channels.
--    Only active group members may join/receive; edge functions send with
--    private: true via the Realtime REST API (service role).
--    No authenticated INSERT policy: clients never publish on this topic
--    (RLS default-deny for INSERT when no policy grants it).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
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

    DROP POLICY IF EXISTS "deny_authenticated_group_sync_broadcast_send"
      ON realtime.messages;
  END IF;
END $$;
