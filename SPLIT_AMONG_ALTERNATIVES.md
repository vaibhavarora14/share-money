# Alternative Data Structures for `split_among`

## Current Implementation: JSONB Array

**Current Structure:**
```sql
split_among JSONB DEFAULT '[]'::jsonb
-- Example: ["uuid1", "uuid2", "uuid3"]
```

**Pros:**
- ✅ Simple and straightforward
- ✅ Good for equal splits (current requirement)
- ✅ Single column, easy to query
- ✅ Flexible (can store any array structure)
- ✅ GIN index supports efficient queries

**Cons:**
- ❌ Can't store unequal splits easily
- ❌ No metadata per user (e.g., custom amounts)
- ❌ Harder to query "who owes what to whom"
- ❌ No audit trail of split changes

---

## Alternative 1: PostgreSQL Native Array (UUID[])

**Structure:**
```sql
split_among UUID[] DEFAULT ARRAY[]::UUID[]
-- Example: ARRAY['uuid1'::UUID, 'uuid2'::UUID]
```

**Pros:**
- ✅ Type-safe (PostgreSQL enforces UUID type)
- ✅ Better performance than JSONB for simple arrays
- ✅ Native array operators (`@>`, `<@`, `&&`)
- ✅ Simpler queries: `WHERE 'uuid1' = ANY(split_among)`
- ✅ No JSON parsing needed

**Cons:**
- ❌ Still can't store unequal splits
- ❌ Less flexible than JSONB
- ❌ Array size limits (though rarely an issue)

**Example Query:**
```sql
-- Find all expenses user is part of
SELECT * FROM transactions 
WHERE 'user-uuid' = ANY(split_among);

-- Check if user is in split
SELECT * FROM transactions 
WHERE split_among @> ARRAY['user-uuid'::UUID];
```

**Verdict:** ⭐ **Better for current use case** - Type-safe, faster, simpler queries

---

## Alternative 2: Junction Table (Normalized)

**Structure:**
```sql
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2), -- For future unequal splits
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_id, user_id)
);

CREATE INDEX idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
CREATE INDEX idx_transaction_splits_user_id ON transaction_splits(user_id);
```

**Pros:**
- ✅ **Best for future unequal splits** - Can store custom amounts per user
- ✅ Normalized (follows database best practices)
- ✅ Easy to query "who owes what"
- ✅ Can add metadata (e.g., `is_paid`, `paid_at`)
- ✅ Better for complex queries and reporting
- ✅ Supports many-to-many relationships properly

**Cons:**
- ❌ More complex (requires JOINs)
- ❌ More tables to manage
- ❌ Slightly more overhead for simple queries
- ❌ Requires migration of existing data

**Example Queries:**
```sql
-- Get all splits for a transaction
SELECT ts.*, u.email 
FROM transaction_splits ts
JOIN auth.users u ON ts.user_id = u.id
WHERE ts.transaction_id = 123;

-- Find all expenses user is part of
SELECT t.* 
FROM transactions t
JOIN transaction_splits ts ON t.id = ts.transaction_id
WHERE ts.user_id = 'user-uuid';

-- Calculate who owes what
SELECT 
  t.paid_by as paid_by_user,
  ts.user_id as owes_user,
  ts.amount as owes_amount
FROM transactions t
JOIN transaction_splits ts ON t.id = ts.transaction_id
WHERE t.paid_by != ts.user_id;
```

**Verdict:** ⭐⭐⭐ **Best for long-term** - Most flexible, supports future features

---

## Alternative 3: JSONB Object with Metadata

**Structure:**
```sql
split_among JSONB DEFAULT '[]'::jsonb
-- Example: [
--   {"user_id": "uuid1", "amount": 33.33, "is_paid": false},
--   {"user_id": "uuid2", "amount": 33.33, "is_paid": false}
-- ]
```

**Pros:**
- ✅ Can store unequal splits
- ✅ Can add metadata (amount, paid status, etc.)
- ✅ Still single column
- ✅ Flexible structure

**Cons:**
- ❌ More complex queries (JSONB path operations)
- ❌ Harder to validate (need complex constraints)
- ❌ Less type-safe
- ❌ Slower queries than normalized approach

**Example Query:**
```sql
-- Find expenses user is part of
SELECT * FROM transactions
WHERE split_among @> '[{"user_id": "uuid1"}]'::jsonb;

-- Update paid status (complex)
UPDATE transactions
SET split_among = jsonb_set(
  split_among,
  '{0,is_paid}',
  'true'::jsonb
)
WHERE id = 123;
```

**Verdict:** ⚠️ **Good middle ground** - Flexible but complex

---

## Alternative 4: Separate Splits Table with Amounts

**Structure:**
```sql
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  split_amount DECIMAL(10, 2) NOT NULL, -- Calculated: amount / count
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_id, user_id)
);
```

**Pros:**
- ✅ Supports unequal splits (can override `split_amount`)
- ✅ Can track payment status per user
- ✅ Easy to calculate balances
- ✅ Audit trail of payments
- ✅ Better for complex financial logic

**Cons:**
- ❌ More complex schema
- ❌ Requires JOINs for most queries
- ❌ More code to maintain

**Verdict:** ⭐⭐ **Best for payment tracking** - If you need to track who paid their share

---

## Comparison Matrix

| Feature | JSONB Array (Current) | UUID[] Array | Junction Table | JSONB Object | Splits Table |
|---------|----------------------|--------------|----------------|--------------|--------------|
| **Simplicity** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Type Safety** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Query Performance** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Equal Splits** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Unequal Splits** | ❌ | ❌ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Payment Tracking** | ❌ | ❌ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| **Metadata Support** | ❌ | ❌ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Migration Complexity** | N/A | ⭐⭐ | ⭐ | ⭐⭐ | ⭐ |
| **Future-Proof** | ⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

---

## Recommendations by Use Case

### Current: Equal Splits Only
**Best Choice:** **UUID[] Array** (Alternative 1)
- Type-safe
- Better performance
- Simpler queries
- Easy migration from JSONB

### Future: Unequal Splits
**Best Choice:** **Junction Table** (Alternative 2)
- Most flexible
- Best for complex queries
- Industry standard approach
- Easy to extend

### Future: Payment Tracking
**Best Choice:** **Splits Table** (Alternative 4)
- Tracks who paid their share
- Supports partial payments
- Better for financial reporting

---

## Migration Path

### Option A: UUID[] Array (Minimal Change)
```sql
-- Migration
ALTER TABLE transactions 
ALTER COLUMN split_among TYPE UUID[] 
USING split_among::text::UUID[];

-- Update default
ALTER TABLE transactions 
ALTER COLUMN split_among SET DEFAULT ARRAY[]::UUID[];
```

**Effort:** Low (1-2 hours)
**Risk:** Low
**Benefit:** Type safety, better performance

### Option B: Junction Table (Major Refactor)
```sql
-- Create new table
CREATE TABLE transaction_splits (...);

-- Migrate data
INSERT INTO transaction_splits (transaction_id, user_id, amount)
SELECT 
  t.id,
  jsonb_array_elements_text(t.split_among)::UUID,
  t.amount / jsonb_array_length(t.split_among)
FROM transactions t
WHERE t.split_among IS NOT NULL 
  AND jsonb_array_length(t.split_among) > 0;

-- Drop old column
ALTER TABLE transactions DROP COLUMN split_among;
```

**Effort:** High (1-2 days)
**Risk:** Medium
**Benefit:** Maximum flexibility, future-proof

---

## My Recommendation

**For Current Phase:** Keep JSONB Array (it works, no breaking changes)

**For Next Phase (if adding unequal splits):** Migrate to **Junction Table** (Alternative 2)

**Quick Win:** Consider **UUID[] Array** (Alternative 1) - Better type safety with minimal changes

---

## Code Impact Analysis

### UUID[] Array
- ✅ Minimal code changes
- ✅ Better type safety
- ✅ Simpler queries
- ⚠️ Need to update TypeScript types

### Junction Table
- ⚠️ Significant code changes
- ✅ Better data model
- ✅ Easier to add features
- ⚠️ Need new API endpoints or modify existing

### JSONB Object
- ⚠️ Moderate code changes
- ⚠️ More complex validation
- ✅ Flexible structure
- ⚠️ Harder to query
