-- Enable Realtime Replication & Composite Indexes for High-Performance Queries
-- Migration: 20260925000000_enable_realtime_and_indexes.sql
--
-- NOTE: Private-channel RLS on realtime.messages cannot be applied by the
-- GitHub Actions db-push role (not owner of realtime.messages). That SQL lives
-- in supabase/manual/realtime_messages_group_sync_rls.sql and must be run
-- manually in the Supabase SQL Editor as a privileged role.

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
