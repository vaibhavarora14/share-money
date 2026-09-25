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
