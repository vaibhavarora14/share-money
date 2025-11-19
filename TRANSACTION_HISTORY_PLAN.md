# Transaction History Tracking & Activity Feed Plan

## Quick Summary

**Goal**: Track all transaction changes and show an activity feed in groups.

**Key Components**:
1. **Database**: `transaction_history` table with triggers to auto-capture changes
2. **API**: `/api/activity` endpoint for activity feed
3. **Frontend**: `ActivityFeed` component integrated into `GroupDetailsScreen`

**Approach**: 
- Use PostgreSQL triggers for automatic history capture (no code changes needed in transaction endpoints)
- Store changes as JSONB diffs for flexibility
- Denormalize `group_id` in history table for fast activity feed queries

**Timeline**: ~12-15 hours total implementation

---

## Overview
Implement comprehensive history tracking for all transaction changes (create, update, delete) and display an activity feed within groups showing all changes made by members.

## Goals
1. **Complete Audit Trail**: Track every change to transactions with who, what, when, and before/after values
2. **Activity Feed**: Display chronological feed of all transaction-related activities within a group
3. **User-Friendly**: Show readable activity descriptions (e.g., "John added expense: $50 for Pizza")
4. **Performance**: Efficient queries and indexing for fast activity feed loading
5. **Extensibility**: Support future tracking of settlements, member changes, etc.

---

## Database Design

### 1. Transaction History Table

```sql
CREATE TABLE transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- Denormalized for faster queries
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Store change details as JSONB for flexibility
  -- For 'created': stores initial values
  -- For 'updated': stores {field: {old: value, new: value}} diff
  -- For 'deleted': stores final values before deletion
  changes JSONB NOT NULL,
  
  -- Optional: Store full snapshot of transaction at time of change
  -- Useful for deleted transactions or complex diffs
  snapshot JSONB,
  
  -- Metadata
  ip_address INET, -- Optional: track where change came from
  user_agent TEXT   -- Optional: track client info
);

-- Indexes for performance
CREATE INDEX idx_transaction_history_transaction_id ON transaction_history(transaction_id);
CREATE INDEX idx_transaction_history_group_id ON transaction_history(group_id);
CREATE INDEX idx_transaction_history_changed_at ON transaction_history(changed_at DESC);
CREATE INDEX idx_transaction_history_changed_by ON transaction_history(changed_by);
CREATE INDEX idx_transaction_history_action ON transaction_history(action);
CREATE INDEX idx_transaction_history_group_changed_at ON transaction_history(group_id, changed_at DESC); -- For activity feed queries

-- GIN index for JSONB queries
CREATE INDEX idx_transaction_history_changes_gin ON transaction_history USING GIN (changes);
```

### 2. Update Transactions Table

```sql
-- Add updated_at timestamp to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to automatically update updated_at on changes
CREATE OR REPLACE FUNCTION update_transaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_updated_at_trigger
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_transaction_updated_at();
```

### 3. History Tracking Trigger Function

```sql
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

-- Create trigger
CREATE TRIGGER transaction_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION track_transaction_changes();
```

### 4. Row Level Security for History

```sql
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
```

---

## API Design

### 1. Activity Feed Endpoint

**GET `/api/activity?group_id={uuid}&limit=50&offset=0`**

Returns chronological activity feed for a group.

**Response:**
```typescript
interface ActivityItem {
  id: string;
  type: 'transaction_created' | 'transaction_updated' | 'transaction_deleted';
  transaction_id?: number;
  group_id: string;
  changed_by: {
    id: string;
    email: string;
  };
  changed_at: string;
  
  // Human-readable description
  description: string;
  
  // Detailed change info
  details: {
    action: 'created' | 'updated' | 'deleted';
    changes?: {
      [field: string]: {
        old: any;
        new: any;
      };
    };
    transaction?: Transaction; // Snapshot
  };
}

interface ActivityFeedResponse {
  activities: ActivityItem[];
  total: number;
  has_more: boolean;
}
```

**Example Response:**
```json
{
  "activities": [
    {
      "id": "uuid-1",
      "type": "transaction_created",
      "transaction_id": 123,
      "group_id": "group-uuid",
      "changed_by": {
        "id": "user-uuid",
        "email": "john@example.com"
      },
      "changed_at": "2025-01-20T10:30:00Z",
      "description": "John added expense: $50.00 for Pizza",
      "details": {
        "action": "created",
        "transaction": { /* full transaction */ }
      }
    },
    {
      "id": "uuid-2",
      "type": "transaction_updated",
      "transaction_id": 123,
      "group_id": "group-uuid",
      "changed_by": {
        "id": "user-uuid-2",
        "email": "jane@example.com"
      },
      "changed_at": "2025-01-20T11:15:00Z",
      "description": "Jane updated expense: Changed amount from $50.00 to $55.00",
      "details": {
        "action": "updated",
        "changes": {
          "amount": {
            "old": 50.00,
            "new": 55.00
          }
        },
        "transaction": { /* current transaction */ }
      }
    }
  ],
  "total": 150,
  "has_more": true
}
```

### 2. Transaction History Endpoint

**GET `/api/transactions/{id}/history`**

Returns full history for a specific transaction.

**Response:**
```typescript
interface TransactionHistoryResponse {
  transaction_id: number;
  history: ActivityItem[];
}
```

### 3. Implementation Location

- **Backend**: `netlify/functions/activity.ts` (new file)
- **Frontend Hook**: `mobile/hooks/useActivity.ts` (new file)
- **Frontend Component**: `mobile/components/ActivityFeed.tsx` (new file)

---

## Frontend Implementation

### 1. Activity Feed Component

**Location**: `mobile/components/ActivityFeed.tsx`

**Features:**
- Chronological list of activities
- Grouped by date (Today, Yesterday, This Week, etc.)
- Color-coded by action type (green for created, yellow for updated, red for deleted)
- Expandable details showing what changed
- User avatars/initials
- Transaction links (navigate to transaction detail)

**UI Design:**
```
┌─────────────────────────────────────┐
│ Activity Feed                      │
├─────────────────────────────────────┤
│ Today                              │
│ ┌─────────────────────────────────┐ │
│ │ 👤 John                         │ │
│ │ Added expense: $50.00 for Pizza │ │
│ │ 2 hours ago                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 👤 Jane                         │ │
│ │ Updated expense: Changed amount │ │
│ │ from $50.00 to $55.00          │ │
│ │ 1 hour ago                      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Yesterday                           │
│ ┌─────────────────────────────────┐ │
│ │ 👤 Bob                          │ │
│ │ Deleted expense: $30.00        │ │
│ │ Yesterday at 3:45 PM           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 2. Integration into GroupDetailsScreen

Add new section/tab for Activity Feed:
- Option 1: New tab alongside "Transactions", "Balances", "Members"
- Option 2: Collapsible section at top of screen
- Option 3: Separate screen accessible via navigation

**Recommended**: Add as a new section in GroupDetailsScreen, similar to Settlement History.

### 3. Activity Description Generation

Create utility function to generate human-readable descriptions:

```typescript
// mobile/utils/activityDescriptions.ts

function generateActivityDescription(
  activity: ActivityItem,
  currentUser?: User
): string {
  const userName = activity.changed_by.id === currentUser?.id 
    ? 'You' 
    : activity.changed_by.email.split('@')[0];
  
  const transaction = activity.details.transaction;
  
  switch (activity.details.action) {
    case 'created':
      return `${userName} added ${transaction.type}: ${formatCurrency(transaction.amount)} for ${transaction.description}`;
    
    case 'updated':
      const changes = Object.keys(activity.details.changes || {});
      if (changes.length === 1) {
        const field = changes[0];
        const { old, new: newVal } = activity.details.changes[field];
        return `${userName} updated ${field}: Changed from ${formatValue(field, old)} to ${formatValue(field, newVal)}`;
      } else {
        return `${userName} updated expense: ${changes.length} fields changed`;
      }
    
    case 'deleted':
      return `${userName} deleted ${transaction.type}: ${formatCurrency(transaction.amount)} for ${transaction.description}`;
  }
}
```

---

## Migration Strategy

### Phase 1: Database Setup
1. Create `transaction_history` table
2. Add `updated_at` to `transactions` table
3. Create trigger function and trigger
4. Add RLS policies
5. **Backfill**: Optionally backfill history for existing transactions (mark as "system" or skip)

### Phase 2: Backend API
1. Create activity feed endpoint
2. Create transaction history endpoint
3. Add description generation logic
4. Test with sample data

### Phase 3: Frontend
1. Create `useActivity` hook
2. Create `ActivityFeed` component
3. Integrate into `GroupDetailsScreen`
4. Add navigation/routing if needed

### Phase 4: Testing & Polish
1. Test all transaction operations (create, update, delete)
2. Verify history is captured correctly
3. Test activity feed performance with large datasets
4. Add loading states and error handling
5. Polish UI/UX

---

## Performance Considerations

### 1. Indexing
- Composite index on `(group_id, changed_at DESC)` for activity feed queries
- Index on `transaction_id` for transaction-specific history
- GIN index on `changes` JSONB for complex queries (if needed)

### 2. Query Optimization
- Use pagination (limit/offset or cursor-based)
- Only fetch necessary fields
- Consider materialized views for frequently accessed data

### 3. Caching Strategy
- Cache activity feed for 30-60 seconds
- Invalidate on new activity
- Use React Query for client-side caching

### 4. Data Retention
- Consider archiving old history (>1 year) to separate table
- Or implement soft deletion with retention policy

---

## Future Enhancements

### 1. Additional Activity Types
- Settlement created/updated/deleted
- Member added/removed
- Group settings changed
- Invitation sent/accepted

### 2. Advanced Features
- Filter by activity type
- Filter by user
- Search activity feed
- Export activity log
- Real-time updates (WebSocket/SSE)

### 3. Notifications
- Notify users when transactions they're involved in are changed
- Email digest of daily activity

### 4. Analytics
- Activity trends
- Most active users
- Transaction change frequency

---

## Security Considerations

1. **RLS Policies**: Ensure users can only see activity for groups they belong to
2. **Sensitive Data**: Consider masking sensitive information in history
3. **Rate Limiting**: Prevent abuse of history endpoints
4. **Audit**: Log access to history data (if required for compliance)

---

## Testing Checklist

- [ ] Transaction creation creates history entry
- [ ] Transaction update creates history entry with correct diff
- [ ] Transaction deletion creates history entry
- [ ] Activity feed returns correct chronological order
- [ ] Activity feed respects group membership
- [ ] Pagination works correctly
- [ ] Description generation is accurate
- [ ] Performance is acceptable with 1000+ history entries
- [ ] RLS policies prevent unauthorized access
- [ ] Triggers handle edge cases (NULL values, etc.)

---

## File Structure

```
/supabase/migrations/
  └── YYYYMMDDHHMMSS_add_transaction_history.sql

/netlify/functions/
  └── activity.ts (new)

/mobile/hooks/
  └── useActivity.ts (new)

/mobile/components/
  └── ActivityFeed.tsx (new)
  └── ActivityFeed.styles.ts (new)

/mobile/utils/
  └── activityDescriptions.ts (new)

/mobile/types/
  └── activity.ts (new - add ActivityItem type)
```

---

## Estimated Effort

- **Database Migration**: 2-3 hours
- **Backend API**: 3-4 hours
- **Frontend Components**: 4-5 hours
- **Testing & Polish**: 2-3 hours
- **Total**: ~12-15 hours

---

## Open Questions

1. **Backfill Strategy**: Should we backfill history for existing transactions?
   - Option A: Skip (only track new changes)
   - Option B: Create "system" entries for existing transactions
   - Option C: Mark existing transactions with creation date but no history

2. **History Retention**: How long should we keep history?
   - Option A: Forever
   - Option B: 1 year, then archive
   - Option C: Configurable per group

3. **Transaction Splits**: Should changes to `transaction_splits` table be tracked separately or included in transaction history?
   - Recommendation: Include in transaction history as part of the diff

4. **UI Placement**: Where should activity feed appear?
   - Recommendation: New section in GroupDetailsScreen, similar to Settlement History

5. **Real-time Updates**: Should activity feed update in real-time?
   - Phase 1: Polling/refresh
   - Phase 2: WebSocket/SSE for real-time
