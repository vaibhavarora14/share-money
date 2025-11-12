# Transaction Splits Implementation

## Overview

This document describes the implementation of the `transaction_splits` table, which enables better expense splitting and prepares the foundation for:
- ✅ Equal splits (current implementation)
- 🔜 Unequal splits (future feature)
- 🔜 Group balance calculations (future feature)
- 🔜 Group settlements (future feature)

## What Was Implemented

### 1. Database Schema

**New Table: `transaction_splits`**
- Stores individual split amounts per user per transaction
- Supports equal splits (current) and unequal splits (future)
- Foreign keys ensure data integrity
- RLS policies enforce access control

**Migration Files:**
- `20250114000000_create_transaction_splits.sql` - Creates the table
- `20250114000001_backfill_transaction_splits.sql` - Migrates existing data

### 2. TypeScript Types

**New Interface: `TransactionSplit`**
```typescript
export interface TransactionSplit {
  id: string;
  transaction_id: number;
  user_id: string;
  amount: number; // Individual split amount
  created_at?: string;
  email?: string; // Populated from API join
}
```

**Updated Interface: `Transaction`**
- Added `splits?: TransactionSplit[]` field
- Kept `split_among?: string[]` for backward compatibility

### 3. API Changes

**POST /transactions**
- Creates transaction in `transactions` table (with `split_among` for backward compatibility)
- Also creates entries in `transaction_splits` table (dual-write)
- Returns transaction with `splits` populated

**PUT /transactions**
- Updates transaction in `transactions` table
- Updates `transaction_splits` when `split_among` changes
- Recalculates split amounts when transaction amount changes

**GET /transactions**
- Fetches transactions with `transaction_splits` joined
- Returns both `splits` (preferred) and `split_among` (backward compatibility)
- Derives `split_among` from `splits` if needed

### 4. Backward Compatibility

- `split_among` column remains in `transactions` table
- API writes to both `split_among` and `transaction_splits` (dual-write)
- API reads from `transaction_splits` but includes `split_among` for compatibility
- Frontend can use either field (prefer `splits`)

## How It Works

### Creating a Transaction with Splits

**Request:**
```json
POST /transactions
{
  "amount": 100.00,
  "description": "Dinner",
  "date": "2025-01-14",
  "type": "expense",
  "group_id": "group-uuid",
  "paid_by": "user-uuid-1",
  "split_among": ["user-uuid-1", "user-uuid-2", "user-uuid-3"]
}
```

**What Happens:**
1. Transaction created in `transactions` table with `split_among = ["uuid1", "uuid2", "uuid3"]`
2. Three entries created in `transaction_splits`:
   - `transaction_id=1, user_id=uuid1, amount=33.33`
   - `transaction_id=1, user_id=uuid2, amount=33.33`
   - `transaction_id=1, user_id=uuid3, amount=33.34` (rounding)

**Response:**
```json
{
  "id": 1,
  "amount": 100.00,
  "split_among": ["uuid1", "uuid2", "uuid3"],
  "splits": [
    { "id": "split-1", "user_id": "uuid1", "amount": 33.33 },
    { "id": "split-2", "user_id": "uuid2", "amount": 33.33 },
    { "id": "split-3", "user_id": "uuid3", "amount": 33.34 }
  ]
}
```

### Reading Transactions

**Request:**
```
GET /transactions?group_id=group-uuid
```

**Response:**
```json
[
  {
    "id": 1,
    "amount": 100.00,
    "split_among": ["uuid1", "uuid2", "uuid3"],
    "splits": [
      { "id": "split-1", "user_id": "uuid1", "amount": 33.33 },
      { "id": "split-2", "user_id": "uuid2", "amount": 33.33 },
      { "id": "split-3", "user_id": "uuid3", "amount": 33.34 }
    ]
  }
]
```

## Migration Steps

### 1. Run Migration to Create Table

```bash
# Apply the migration to create transaction_splits table
supabase migration up
```

Or manually run:
```sql
-- Run: 20250114000000_create_transaction_splits.sql
```

### 2. Backfill Existing Data

```bash
# Apply the backfill migration
supabase migration up
```

Or manually run:
```sql
-- Run: 20250114000001_backfill_transaction_splits.sql
```

This will migrate all existing `split_among` data to `transaction_splits` table.

### 3. Verify Migration

```sql
-- Check that all splits were migrated
SELECT 
  t.id,
  jsonb_array_length(t.split_among) as split_count_in_array,
  (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) as split_count_in_table
FROM transactions t
WHERE t.split_among IS NOT NULL 
  AND jsonb_array_length(t.split_among) > 0;
```

Both counts should match for all transactions.

## Benefits

### Current Benefits
1. **Explicit Amounts**: Each split has an explicit `amount` field
2. **Better Queries**: Standard SQL JOINs instead of JSONB parsing
3. **Data Integrity**: Foreign keys ensure valid user IDs
4. **Performance**: Indexed foreign keys for faster queries

### Future Benefits (Ready for Implementation)
1. **Unequal Splits**: Just set different `amount` values per split
2. **Balance Calculations**: Easy to calculate who owes whom
3. **Group Settlements**: Can track payments that reduce balances
4. **Reporting**: Better analytics and balance sheets

## Next Steps

### Immediate (Already Done)
- ✅ Create `transaction_splits` table
- ✅ Dual-write to both tables
- ✅ Read from `transaction_splits` with fallback
- ✅ Backfill existing data

### Future Enhancements
1. **Unequal Splits UI**: Allow users to set custom amounts per person
2. **Balance Calculations**: Create views/functions to calculate net balances
3. **Group Settlements**: Create `group_settlements` table for payment tracking
4. **Remove `split_among`**: After all clients updated, remove the old column

## Testing

### Test Creating a Transaction
```bash
curl -X POST https://your-api.netlify.app/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "description": "Test dinner",
    "date": "2025-01-14",
    "type": "expense",
    "group_id": "your-group-id",
    "paid_by": "your-user-id",
    "split_among": ["user-1", "user-2", "user-3"]
  }'
```

### Verify Splits Were Created
```sql
SELECT * FROM transaction_splits 
WHERE transaction_id = <transaction_id>;
```

Should return 3 rows with amounts: 33.33, 33.33, 33.34

## Notes

- The implementation maintains full backward compatibility
- `split_among` column is kept for now (can be removed later)
- All new transactions automatically create `transaction_splits` entries
- Existing transactions are backfilled via migration
- Frontend can gradually migrate to use `splits` instead of `split_among`

