-- Add transaction history tracking and activity feed
-- Created: 2025-01-20
--
-- This migration implements comprehensive history tracking for transactions:
-- 1. Creates transaction_history table to track all changes
-- 2. Creates transaction_history_archive table for records older than 1 year
-- 3. Adds updated_at column to transactions table
-- 4. Creates triggers to automatically capture transaction and split changes
-- 5. Sets up RLS policies for history access

-- ============================================================================
-- PART 1: ADD updated_at TO TRANSACTIONS TABLE
-- ============================================================================

-- Add updated_at timestamp to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create trigger function to automatically update updated_at on changes
CREATE OR REPLACE FUNCTION update_transaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS transaction_updated_at_trigger ON transactions;
CREATE TRIGGER transaction_updated_at_trigger
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_updated_at();

-- ============================================================================
-- PART 2: CREATE TRANSACTION HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- Denormalized for faster queries
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'splits_updated')),
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Store change details as JSONB for flexibility
  -- For 'created': stores initial values
  -- For 'updated': stores {field: {old: value, new: value}} diff
  -- For 'deleted': stores final values before deletion
  -- For 'splits_updated': stores split changes (old/new splits arrays)
  changes JSONB NOT NULL,
  
  -- Optional: Store full snapshot of transaction at time of change
  -- Useful for deleted transactions or complex diffs
  snapshot JSONB,
  
  -- Metadata
  ip_address INET, -- Optional: track where change came from
  user_agent TEXT   -- Optional: track client info
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_history_transaction_id ON transaction_history(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_group_id ON transaction_history(group_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_changed_at ON transaction_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_history_changed_by ON transaction_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_transaction_history_action ON transaction_history(action);
CREATE INDEX IF NOT EXISTS idx_transaction_history_group_changed_at ON transaction_history(group_id, changed_at DESC); -- For activity feed queries

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_transaction_history_changes_gin ON transaction_history USING GIN (changes);

-- ============================================================================
-- PART 3: CREATE ARCHIVE TABLE (for records older than 1 year)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_history_archive (
  LIKE transaction_history INCLUDING ALL
);

-- Indexes for archive table
CREATE INDEX IF NOT EXISTS idx_transaction_history_archive_transaction_id ON transaction_history_archive(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_archive_group_id ON transaction_history_archive(group_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_archive_changed_at ON transaction_history_archive(changed_at DESC);

-- ============================================================================
-- PART 4: CREATE TRIGGER FUNCTIONS
-- ============================================================================

-- Function to capture transaction changes
CREATE OR REPLACE FUNCTION track_transaction_changes()
RETURNS TRIGGER AS $$
DECLARE
  change_data JSONB;
  old_data JSONB;
  new_data JSONB;
  diff JSONB := '{}'::JSONB;
  field TEXT;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    -- Created: store initial values
    change_data := jsonb_build_object(
      'action', 'created',
      'transaction', to_jsonb(NEW)
    );
    
    INSERT INTO transaction_history (
      transaction_id,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      NEW.id,
      NEW.group_id,
      'created',
      COALESCE(NEW.user_id, auth.uid()), -- Fallback to auth context
      change_data,
      to_jsonb(NEW) -- Full snapshot
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Updated: calculate diff
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    
    -- Build diff object: {field: {old: value, new: value}}
    FOR field IN SELECT jsonb_object_keys(old_data) LOOP
      IF old_data->>field IS DISTINCT FROM new_data->>field THEN
        diff := diff || jsonb_build_object(
          field,
          jsonb_build_object(
            'old', old_data->field,
            'new', new_data->field
          )
        );
      END IF;
    END LOOP;
    
    -- Only record if there are actual changes
    IF jsonb_object_keys(diff) IS NOT NULL THEN
      change_data := jsonb_build_object(
        'action', 'updated',
        'diff', diff,
        'transaction_id', NEW.id
      );
      
      INSERT INTO transaction_history (
        transaction_id,
        group_id,
        action,
        changed_by,
        changes,
        snapshot
      ) VALUES (
        NEW.id,
        COALESCE(NEW.group_id, OLD.group_id), -- Use new or old group_id
        'updated',
        COALESCE(auth.uid(), NEW.user_id, OLD.user_id),
        change_data,
        to_jsonb(NEW) -- Current state snapshot
      );
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Deleted: store final values
    change_data := jsonb_build_object(
      'action', 'deleted',
      'transaction', to_jsonb(OLD)
    );
    
    INSERT INTO transaction_history (
      transaction_id,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      OLD.id,
      OLD.group_id,
      'deleted',
      COALESCE(auth.uid(), OLD.user_id),
      change_data,
      to_jsonb(OLD) -- Final snapshot before deletion
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to capture transaction_splits changes
CREATE OR REPLACE FUNCTION track_transaction_splits_changes()
RETURNS TRIGGER AS $$
DECLARE
  transaction_record RECORD;
  old_splits JSONB;
  new_splits JSONB;
  change_data JSONB;
BEGIN
  -- Get the parent transaction
  SELECT * INTO transaction_record
  FROM transactions
  WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);
  
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Only track for group transactions
  IF transaction_record.group_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Get current splits for this transaction
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'amount', amount
      ) ORDER BY user_id
    ), '[]'::jsonb) INTO new_splits
    FROM transaction_splits
    WHERE transaction_id = NEW.transaction_id;
    
    -- For updates, get old splits (before this change)
    IF TG_OP = 'UPDATE' THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'amount', amount
        ) ORDER BY user_id
      ), '[]'::jsonb) INTO old_splits
      FROM transaction_splits
      WHERE transaction_id = OLD.transaction_id
      AND id != NEW.id; -- Exclude the one being updated
      
      -- Add the old version of this split
      old_splits := old_splits || jsonb_build_object(
        'user_id', OLD.user_id,
        'amount', OLD.amount
      );
      
      -- Sort for comparison
      SELECT jsonb_agg(value ORDER BY value->>'user_id')
      INTO old_splits
      FROM jsonb_array_elements(old_splits);
    ELSE
      -- For insert, get splits before this insert
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'amount', amount
        ) ORDER BY user_id
      ), '[]'::jsonb) INTO old_splits
      FROM transaction_splits
      WHERE transaction_id = NEW.transaction_id
      AND id != NEW.id;
    END IF;
    
    -- Only record if splits actually changed
    IF old_splits IS DISTINCT FROM new_splits THEN
      change_data := jsonb_build_object(
        'action', 'splits_updated',
        'transaction_id', NEW.transaction_id,
        'old_splits', old_splits,
        'new_splits', new_splits
      );
      
      INSERT INTO transaction_history (
        transaction_id,
        group_id,
        action,
        changed_by,
        changes,
        snapshot
      ) VALUES (
        NEW.transaction_id,
        transaction_record.group_id,
        'splits_updated',
        COALESCE(auth.uid(), transaction_record.user_id),
        change_data,
        jsonb_build_object(
          'transaction', to_jsonb(transaction_record),
          'splits', new_splits
        )
      );
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Get splits before deletion
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'amount', amount
      ) ORDER BY user_id
    ), '[]'::jsonb) INTO old_splits
    FROM transaction_splits
    WHERE transaction_id = OLD.transaction_id;
    
    -- Get splits after deletion
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'amount', amount
      ) ORDER BY user_id
    ), '[]'::jsonb) INTO new_splits
    FROM transaction_splits
    WHERE transaction_id = OLD.transaction_id
    AND id != OLD.id;
    
    -- Only record if splits changed
    IF old_splits IS DISTINCT FROM new_splits THEN
      change_data := jsonb_build_object(
        'action', 'splits_updated',
        'transaction_id', OLD.transaction_id,
        'old_splits', old_splits,
        'new_splits', new_splits
      );
      
      INSERT INTO transaction_history (
        transaction_id,
        group_id,
        action,
        changed_by,
        changes,
        snapshot
      ) VALUES (
        OLD.transaction_id,
        transaction_record.group_id,
        'splits_updated',
        COALESCE(auth.uid(), transaction_record.user_id),
        change_data,
        jsonb_build_object(
          'transaction', to_jsonb(transaction_record),
          'splits', new_splits
        )
      );
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive old history records (>1 year)
CREATE OR REPLACE FUNCTION archive_old_transaction_history()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- Move records older than 1 year to archive table
  WITH moved AS (
    DELETE FROM transaction_history
    WHERE changed_at < NOW() - INTERVAL '1 year'
    RETURNING *
  )
  INSERT INTO transaction_history_archive
  SELECT * FROM moved;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: CREATE TRIGGERS
-- ============================================================================

-- Trigger for transactions table
DROP TRIGGER IF EXISTS transaction_history_trigger ON transactions;
CREATE TRIGGER transaction_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION track_transaction_changes();

-- Trigger for transaction_splits table (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction_splits') THEN
    DROP TRIGGER IF EXISTS transaction_splits_history_trigger ON transaction_splits;
    CREATE TRIGGER transaction_splits_history_trigger
      AFTER INSERT OR UPDATE OR DELETE ON transaction_splits
      FOR EACH ROW
      EXECUTE FUNCTION track_transaction_splits_changes();
  END IF;
END $$;

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE transaction_history ENABLE ROW LEVEL SECURITY;

-- Users can view history for transactions in groups they belong to
CREATE POLICY "Users can view transaction history in their groups"
  ON transaction_history
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    OR transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- Enable RLS for archive table
ALTER TABLE transaction_history_archive ENABLE ROW LEVEL SECURITY;

-- Same policy for archive table
CREATE POLICY "Users can view archived transaction history in their groups"
  ON transaction_history_archive
  FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
    OR transaction_id IN (
      SELECT id FROM transactions WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE transaction_history IS 'Tracks all changes to transactions (create, update, delete, splits changes) for activity feed and audit trail';
COMMENT ON TABLE transaction_history_archive IS 'Archived transaction history records older than 1 year';
COMMENT ON COLUMN transaction_history.changes IS 'JSONB object storing change details (diff for updates, full data for create/delete)';
COMMENT ON COLUMN transaction_history.snapshot IS 'Full snapshot of transaction state at time of change';
COMMENT ON FUNCTION archive_old_transaction_history() IS 'Moves transaction history records older than 1 year to archive table. Can be called manually or via cron job.';
