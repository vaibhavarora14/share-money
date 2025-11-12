# Current Implementation Flow: Expense Splitting

## Complete User Journey

### 1. User Opens Transaction Form (Group Expense)

**Location:** `GroupDetailsScreen.tsx` → `TransactionFormScreen`

**What Happens:**
```
User clicks "Add" button
  ↓
TransactionFormScreen opens with:
  - groupMembers = [member1, member2, member3] (from group.members)
  - groupId = "group-uuid"
  - type = "expense" (default)
```

**Initialization:**
- Form detects `isGroupExpense = true` (expense + groupId + members exist)
- **Default behavior:** All members are pre-selected in `splitAmong`
- `splitAmong = ["uuid1", "uuid2", "uuid3"]` (all member user IDs)
- `paidBy = ""` (empty, user must select)

---

### 2. User Fills Out Form

**Fields Shown:**
1. **Description** - Text input
2. **Amount** - Number input (validated: must be > 0, format: `123.45`)
3. **Date** - Date picker
4. **Type** - Expense/Income toggle
5. **Category** - Optional text
6. **Paid By** - Dropdown picker (only for group expenses)
7. **Split Among** - Checkbox list (only for group expenses)

**Split Among UI:**
```
Split Among                    [Select All]
☑ user1@example.com          $33.33
☑ user2@example.com          $33.33
☑ user3@example.com          $33.33
```

**Real-time Calculation:**
- As user types amount: `$100.00`
- With 3 people selected: Shows `$33.33` next to each person
- Formula: `amount / splitAmong.length`
- Updates live as user selects/deselects members

**User Actions:**
- Can deselect all (button disabled until at least 1 selected)
- Can toggle individual members
- Can use "Select All" / "Deselect All" button
- Can change amount and see split update in real-time

---

### 3. User Clicks "Create" Button

**Validation Happens:**
```typescript
validateForm() {
  ✓ Description not empty
  ✓ Amount is valid number > 0
  ✓ Date is selected
  ✓ paidBy is selected (if group expense)
  ✓ splitAmong has at least 1 person (if group expense)
}
```

**If Validation Fails:**
- Inline error messages appear below each field
- Button stays enabled (doesn't disable)
- User can fix errors and try again

**If Validation Passes:**
- `handleSave()` is called
- Data is sent to API

---

### 4. Frontend → API Request

**Location:** `useTransactionMutations.ts` → `fetchWithAuth("/transactions")`

**Request Body:**
```json
{
  "description": "Dinner at restaurant",
  "amount": 100.00,
  "date": "2025-01-12",
  "type": "expense",
  "category": "Food",
  "currency": "USD",
  "group_id": "group-uuid",
  "paid_by": "user-uuid-1",
  "split_among": ["user-uuid-1", "user-uuid-2", "user-uuid-3"]
}
```

**Note:** `split_among` is sent as JavaScript array, Supabase converts to JSONB automatically

---

### 5. API Processing (Backend)

**Location:** `netlify/functions/transactions.ts`

**Step 1: Authentication**
- Validates JWT token
- Gets current user ID

**Step 2: Validation**
```typescript
✓ Required fields present
✓ Type is "expense" or "income"
✓ User is member of group (if group_id provided)
✓ paid_by is a group member (if provided)
✓ All split_among users are group members
✓ Removes duplicates from split_among array
```

**Step 3: Database Insert**
```sql
INSERT INTO transactions (
  user_id,
  amount,
  description,
  date,
  type,
  category,
  group_id,
  currency,
  paid_by,
  split_among  -- JSONB: ["uuid1", "uuid2", "uuid3"]
) VALUES (...)
```

**Database Storage:**
```json
{
  "id": 123,
  "amount": 100.00,
  "description": "Dinner at restaurant",
  "split_among": ["uuid1", "uuid2", "uuid3"],  // JSONB array
  "paid_by": "uuid1"
}
```

**Step 4: Response**
- Returns created transaction
- Supabase automatically converts JSONB back to JavaScript array
- Frontend receives: `split_among: ["uuid1", "uuid2", "uuid3"]`

---

### 6. Data Storage (Database)

**Table:** `transactions`

**Row Example:**
```
id: 123
amount: 100.00
description: "Dinner at restaurant"
date: 2025-01-12
type: "expense"
group_id: "group-uuid"
paid_by: "uuid1"  (UUID, references auth.users)
split_among: '["uuid1", "uuid2", "uuid3"]'  (JSONB array)
currency: "USD"
```

**Indexes:**
- `idx_transactions_paid_by` - Fast lookups by payer
- `idx_transactions_split_among` - GIN index for JSONB queries

**Constraint:**
- `check_split_among_is_array` - Ensures it's always an array or null

---

### 7. Displaying Transaction

**Location:** `TransactionsSection.tsx`

**Current Display:**
```
┌─────────────────────────────────────┐
│ Dinner at restaurant          -$100│
│ 2025-01-12 • Food                   │
└─────────────────────────────────────┘
```

**What's NOT Currently Shown:**
- ❌ Who paid (paid_by)
- ❌ Who it's split among (split_among)
- ❌ Individual split amounts

**Why:** The `TransactionsSection` component doesn't display split information yet - it only shows basic transaction details.

---

### 8. Editing Transaction

**When User Clicks Transaction:**
1. `handleEditTransaction(transaction)` called
2. Form opens with transaction data pre-filled
3. `split_among` array loaded into checkboxes
4. User can modify who it's split among
5. On save, API validates and updates

**Update Flow:**
- Validates ownership (user can only edit their own)
- Validates new split_among members are in group
- Updates `split_among` JSONB column
- Returns updated transaction

---

## Data Flow Diagram

```
┌─────────────────┐
│  User Form      │
│  splitAmong:    │
│  ["id1","id2"]  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Request    │
│  split_among:   │
│  ["id1","id2"]  │ (JavaScript array)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase       │
│  Auto-converts  │
│  Array → JSONB  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Database       │
│  split_among:   │
│  '["id1","id2"]'│ (JSONB)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Response   │
│  Supabase       │
│  Auto-converts  │
│  JSONB → Array  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Frontend       │
│  split_among:   │
│  ["id1","id2"]  │ (JavaScript array)
└─────────────────┘
```

---

## Current Limitations

### 1. Equal Splits Only
- **Current:** All selected people get equal share
- **Calculation:** `amount / splitAmong.length`
- **Cannot:** Set custom amounts per person

### 2. No Payment Tracking
- **Current:** Only stores who paid and who owes
- **Cannot:** Track if someone paid their share
- **Cannot:** Mark individual splits as paid

### 3. Limited Display
- **Current:** Transaction list doesn't show split info
- **Cannot:** See "Split among 3 people" in list
- **Cannot:** See individual amounts per person

### 4. No Balance Calculations
- **Current:** Data exists but not used
- **Cannot:** Calculate "User A owes User B $50"
- **Cannot:** Show net balances between users

---

## What Works Well

✅ **Simple & Fast:** Single column, no JOINs needed  
✅ **Type Safe:** Constraint ensures it's always an array  
✅ **Flexible:** Can add/remove people easily  
✅ **Validated:** Backend ensures all users are group members  
✅ **Real-time UI:** Shows split amount as user types  

---

## Example: Complete Flow

**Scenario:** 3 friends split a $100 dinner

1. **User opens form:**
   - Amount: `$100.00`
   - Paid By: `Alice` (selected from dropdown)
   - Split Among: All 3 checked by default
   - Shows: `$33.33` next to each person

2. **User clicks Create:**
   - Validation passes
   - API receives: `split_among: ["alice-uuid", "bob-uuid", "charlie-uuid"]`

3. **Database stores:**
   ```sql
   split_among: '["alice-uuid", "bob-uuid", "charlie-uuid"]'
   paid_by: "alice-uuid"
   amount: 100.00
   ```

4. **Result:**
   - Alice paid $100
   - Split equally: Alice $33.33, Bob $33.33, Charlie $33.33
   - Net: Bob owes Alice $33.33, Charlie owes Alice $33.33

**Note:** Net calculations are not currently displayed, but the data exists to calculate them.

---

## Key Points

1. **Storage:** JSONB array in single column
2. **Calculation:** Always equal (amount / count)
3. **Validation:** Happens at API level
4. **Display:** Basic transaction info only (split details not shown in list)
5. **Editing:** Can modify split_among, but still equal splits only
