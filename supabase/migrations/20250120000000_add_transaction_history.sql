-- Add transaction history tracking and activity feed
-- Created: 2025-01-20
--
-- This migration implements comprehensive history tracking for transactions:
-- 1. Creates transaction_history table to track all changes
-- 2. Creates transaction_history_archive table for records older than 1 year
-- 3. Adds updated_at column to transactions table
-- 4. Creates triggers to automatically capture transaction changes (create, update, delete)
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
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL, -- Nullable for deleted transactions
  settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL, -- Nullable for settlements
  activity_type VARCHAR(20) NOT NULL DEFAULT 'transaction' CHECK (activity_type IN ('transaction', 'settlement')),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- Denormalized for faster queries
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Store change details as JSONB for flexibility
  -- For 'created': stores initial values
  -- For 'updated': stores {field: {old: value, new: value}} diff
  -- For 'deleted': stores final values before deletion
  changes JSONB NOT NULL,
  
  -- Optional: Store full snapshot of transaction/settlement at time of change
  -- Useful for deleted items or complex diffs
  snapshot JSONB,
  
  -- Metadata
  ip_address INET, -- Optional: track where change came from
  user_agent TEXT,   -- Optional: track client info
  
  -- Ensure either transaction_id or settlement_id is set (but not both)
  -- Allow both NULL only for deleted records (where we preserve snapshot)
  CHECK (
    (transaction_id IS NOT NULL AND settlement_id IS NULL) OR
    (transaction_id IS NULL AND settlement_id IS NOT NULL) OR
    (transaction_id IS NULL AND settlement_id IS NULL AND snapshot IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_history_transaction_id ON transaction_history(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_settlement_id ON transaction_history(settlement_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_activity_type ON transaction_history(activity_type);
CREATE INDEX IF NOT EXISTS idx_transaction_history_group_id ON transaction_history(group_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_changed_at ON transaction_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_history_changed_by ON transaction_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_transaction_history_action ON transaction_history(action);
CREATE INDEX IF NOT EXISTS idx_transaction_history_group_changed_at ON transaction_history(group_id, changed_at DESC); -- For activity feed queries
CREATE INDEX IF NOT EXISTS idx_transaction_history_group_type_changed_at ON transaction_history(group_id, activity_type, changed_at DESC); -- For filtered queries

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_transaction_history_changes_gin ON transaction_history USING GIN (changes);

-- Fix existing installations: Add settlement support if table already exists
DO $$
BEGIN
  -- Add settlement_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transaction_history' 
    AND column_name = 'settlement_id'
  ) THEN
    ALTER TABLE transaction_history 
    ADD COLUMN settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_transaction_history_settlement_id 
      ON transaction_history(settlement_id);
  END IF;
  
  -- Add activity_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transaction_history' 
    AND column_name = 'activity_type'
  ) THEN
    ALTER TABLE transaction_history 
    ADD COLUMN activity_type VARCHAR(20) NOT NULL DEFAULT 'transaction' 
      CHECK (activity_type IN ('transaction', 'settlement'));
    
    CREATE INDEX IF NOT EXISTS idx_transaction_history_activity_type 
      ON transaction_history(activity_type);
    
    CREATE INDEX IF NOT EXISTS idx_transaction_history_group_type_changed_at 
      ON transaction_history(group_id, activity_type, changed_at DESC);
  END IF;
  
  -- Make transaction_id nullable if it's NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transaction_history' 
    AND column_name = 'transaction_id' 
    AND is_nullable = 'NO'
  ) THEN
    -- Drop the foreign key constraint first
    ALTER TABLE transaction_history 
    DROP CONSTRAINT IF EXISTS transaction_history_transaction_id_fkey;
    
    -- Make column nullable
    ALTER TABLE transaction_history 
    ALTER COLUMN transaction_id DROP NOT NULL;
    
    -- Recreate foreign key with ON DELETE SET NULL
    ALTER TABLE transaction_history 
    ADD CONSTRAINT transaction_history_transaction_id_fkey 
    FOREIGN KEY (transaction_id) 
    REFERENCES transactions(id) 
    ON DELETE SET NULL;
  END IF;
  
  -- Add or update check constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'transaction_history' 
    AND constraint_name = 'transaction_history_transaction_settlement_check'
  ) THEN
    ALTER TABLE transaction_history 
    ADD CONSTRAINT transaction_history_transaction_settlement_check
    CHECK (
      (transaction_id IS NOT NULL AND settlement_id IS NULL) OR
      (transaction_id IS NULL AND settlement_id IS NOT NULL) OR
      (transaction_id IS NULL AND settlement_id IS NULL AND snapshot IS NOT NULL)
    );
  ELSE
    -- Update existing constraint to allow both NULL for deleted records
    ALTER TABLE transaction_history 
    DROP CONSTRAINT IF EXISTS transaction_history_transaction_settlement_check;
    
    ALTER TABLE transaction_history 
    ADD CONSTRAINT transaction_history_transaction_settlement_check
    CHECK (
      (transaction_id IS NOT NULL AND settlement_id IS NULL) OR
      (transaction_id IS NULL AND settlement_id IS NOT NULL) OR
      (transaction_id IS NULL AND settlement_id IS NULL AND snapshot IS NOT NULL)
    );
  END IF;
  
  -- Also update archive table constraint if it exists
  -- The archive table is created with LIKE, so it might have copied the old constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'transaction_history_archive'
  ) THEN
    -- Drop any existing check constraints related to transaction/settlement
    -- We'll find and drop them dynamically
    DO $$
    DECLARE
      constraint_name_var TEXT;
    BEGIN
      -- Find the constraint name
      SELECT constraint_name INTO constraint_name_var
      FROM information_schema.table_constraints 
      WHERE table_name = 'transaction_history_archive' 
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%transaction%settlement%'
      LIMIT 1;
      
      IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE transaction_history_archive DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
      END IF;
    END $$;
    
    -- Add the updated constraint
    ALTER TABLE transaction_history_archive 
    ADD CONSTRAINT transaction_history_archive_transaction_settlement_check
    CHECK (
      (transaction_id IS NOT NULL AND settlement_id IS NULL) OR
      (transaction_id IS NULL AND settlement_id IS NOT NULL) OR
      (transaction_id IS NULL AND settlement_id IS NULL AND snapshot IS NOT NULL)
    );
  END IF;
END $$;

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
      activity_type,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      NEW.id,
      'transaction',
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
    -- Exclude technical fields that users don't need to see
    FOR field IN SELECT jsonb_object_keys(old_data) LOOP
      -- Skip updated_at, created_at, and id fields (technical/internal)
      IF field NOT IN ('updated_at', 'created_at', 'id') THEN
        IF old_data->>field IS DISTINCT FROM new_data->>field THEN
          diff := diff || jsonb_build_object(
            field,
            jsonb_build_object(
              'old', old_data->field,
              'new', new_data->field
            )
          );
        END IF;
      END IF;
    END LOOP;
    
    -- Only record if there are actual changes
    -- Check if diff object has any keys by comparing to empty object
    IF diff != '{}'::jsonb THEN
      change_data := jsonb_build_object(
        'action', 'updated',
        'diff', diff,
        'transaction_id', NEW.id
      );
      
      INSERT INTO transaction_history (
        transaction_id,
        activity_type,
        group_id,
        action,
        changed_by,
        changes,
        snapshot
      ) VALUES (
        NEW.id,
        'transaction',
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
    -- Note: transaction_id is set to NULL since the transaction no longer exists
    -- but we store the full snapshot in the snapshot field
    change_data := jsonb_build_object(
      'action', 'deleted',
      'transaction', to_jsonb(OLD)
    );
    
    INSERT INTO transaction_history (
      transaction_id,
      activity_type,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      NULL, -- Set to NULL since transaction is deleted (foreign key constraint)
      'transaction',
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


-- Function to capture settlement changes
CREATE OR REPLACE FUNCTION track_settlement_changes()
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
      'settlement', to_jsonb(NEW)
    );
    
    INSERT INTO transaction_history (
      settlement_id,
      activity_type,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      NEW.id,
      'settlement',
      NEW.group_id,
      'created',
      COALESCE(NEW.created_by, auth.uid()), -- Use created_by for settlements
      change_data,
      to_jsonb(NEW) -- Full snapshot
    );
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Updated: calculate diff
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    
    -- Build diff object: {field: {old: value, new: value}}
    -- Exclude technical fields that users don't need to see
    FOR field IN SELECT jsonb_object_keys(old_data) LOOP
      -- Skip created_at, id fields (technical/internal)
      IF field NOT IN ('created_at', 'id') THEN
        IF old_data->>field IS DISTINCT FROM new_data->>field THEN
          diff := diff || jsonb_build_object(
            field,
            jsonb_build_object(
              'old', old_data->field,
              'new', new_data->field
            )
          );
        END IF;
      END IF;
    END LOOP;
    
    -- Only record if there are actual changes
    IF diff != '{}'::jsonb THEN
      change_data := jsonb_build_object(
        'action', 'updated',
        'diff', diff,
        'settlement_id', NEW.id
      );
      
      INSERT INTO transaction_history (
        settlement_id,
        activity_type,
        group_id,
        action,
        changed_by,
        changes,
        snapshot
      ) VALUES (
        NEW.id,
        'settlement',
        NEW.group_id,
        'updated',
        COALESCE(auth.uid(), NEW.created_by, OLD.created_by),
        change_data,
        to_jsonb(NEW) -- Current state snapshot
      );
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Deleted: store final values
    change_data := jsonb_build_object(
      'action', 'deleted',
      'settlement', to_jsonb(OLD)
    );
    
    INSERT INTO transaction_history (
      settlement_id,
      activity_type,
      group_id,
      action,
      changed_by,
      changes,
      snapshot
    ) VALUES (
      NULL, -- Set to NULL since settlement is deleted (foreign key constraint)
      'settlement',
      OLD.group_id,
      'deleted',
      COALESCE(auth.uid(), OLD.created_by),
      change_data,
      to_jsonb(OLD) -- Final snapshot before deletion
    );
    
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

-- Trigger for settlements table
DROP TRIGGER IF EXISTS settlement_history_trigger ON settlements;
CREATE TRIGGER settlement_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION track_settlement_changes();


-- ============================================================================
-- PART 6: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE transaction_history ENABLE ROW LEVEL SECURITY;

-- Users can view history for transactions and settlements in groups they belong to
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
    OR settlement_id IN (
      SELECT id FROM settlements 
      WHERE from_user_id = auth.uid() OR to_user_id = auth.uid()
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

COMMENT ON TABLE transaction_history IS 'Tracks all changes to transactions (create, update, delete) for activity feed and audit trail';
COMMENT ON TABLE transaction_history_archive IS 'Archived transaction history records older than 1 year';
COMMENT ON COLUMN transaction_history.changes IS 'JSONB object storing change details (diff for updates, full data for create/delete)';
COMMENT ON COLUMN transaction_history.snapshot IS 'Full snapshot of transaction state at time of change';
COMMENT ON FUNCTION archive_old_transaction_history() IS 'Moves transaction history records older than 1 year to archive table. Can be called manually or via cron job.';
