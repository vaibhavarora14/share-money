# Future Features Implementation Plan

## Overview

This document outlines the implementation strategy for:
1. Unequal splits (custom amounts per person)
2. Payment tracking (mark who paid their share)
3. Balance calculations (who owes whom)
4. Split info display in transaction list

---

## Feature 1: Unequal Splits

### Database Changes

**Option A: Keep JSONB Array (Simpler)**
```sql
-- Modify split_among to store objects with amounts
-- Current: '["uuid1", "uuid2"]'
-- New: '[{"user_id": "uuid1", "amount": 60.00}, {"user_id": "uuid2", "amount": 40.00}]'

ALTER TABLE transactions
DROP CONSTRAINT check_split_among_is_array;

-- New constraint for object array
ALTER TABLE transactions
ADD CONSTRAINT check_split_among_structure
CHECK (
  split_among IS NULL 
  OR (
    jsonb_typeof(split_among) = 'array'
    AND jsonb_array_length(split_among) > 0
    AND jsonb_array_length(split_among) <= 50 -- Reasonable limit
  )
);

-- Add validation function
CREATE OR REPLACE FUNCTION validate_split_amounts(
  p_split_among JSONB,
  p_total_amount DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
  split_sum DECIMAL := 0;
  item JSONB;
BEGIN
  IF p_split_among IS NULL THEN
    RETURN TRUE;
  END IF;
  
  FOR item IN SELECT * FROM jsonb_array_elements(p_split_among)
  LOOP
    IF item->>'user_id' IS NULL OR item->>'amount' IS NULL THEN
      RETURN FALSE;
    END IF;
    split_sum := split_sum + (item->>'amount')::DECIMAL;
  END LOOP;
  
  -- Allow small rounding differences (0.01)
  RETURN ABS(split_sum - p_total_amount) <= 0.01;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to validate amounts match
CREATE TRIGGER validate_split_amounts_trigger
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW
WHEN (NEW.split_among IS NOT NULL AND NEW.amount IS NOT NULL)
EXECUTE FUNCTION validate_split_amounts(NEW.split_among, NEW.amount);
```

**Option B: Junction Table (Recommended)**
```sql
-- Create transaction_splits table (as shown in JUNCTION_TABLE_DESIGN.md)
-- This is the better long-term solution
```

### TypeScript Types

```typescript
// types.ts

export interface SplitEntry {
  user_id: string;
  amount: number; // Individual amount for this user
}

export interface Transaction {
  // ... existing fields ...
  split_among?: string[]; // For backward compatibility (equal splits)
  splits?: SplitEntry[]; // New: for unequal splits
  split_mode?: 'equal' | 'custom'; // How the split was created
}
```

### Frontend Changes

**TransactionFormScreen.tsx:**

```typescript
// New state for custom amounts
const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
const [customSplits, setCustomSplits] = useState<Map<string, number>>(new Map());

// When amount or splitAmong changes, update custom splits
useEffect(() => {
  if (splitMode === 'equal' && splitAmong.length > 0 && amount) {
    const amountValue = parseFloat(amount);
    if (amountValue > 0) {
      const equalAmount = amountValue / splitAmong.length;
      const newSplits = new Map<string, number>();
      splitAmong.forEach(userId => {
        newSplits.set(userId, equalAmount);
      });
      setCustomSplits(newSplits);
    }
  }
}, [amount, splitAmong, splitMode]);

// UI: Toggle between equal/custom
<SegmentedButtons
  value={splitMode}
  onValueChange={setSplitMode}
  buttons={[
    { value: 'equal', label: 'Equal' },
    { value: 'custom', label: 'Custom' }
  ]}
/>

// When in custom mode, show amount input for each selected member
{splitMode === 'custom' && isGroupExpense && (
  <View style={styles.customSplitsContainer}>
    <Text variant="labelLarge">Custom Amounts</Text>
    {splitAmong.map(userId => {
      const member = groupMembers.find(m => m.user_id === userId);
      const currentAmount = customSplits.get(userId) || 0;
      const remaining = parseFloat(amount || '0') - 
        Array.from(customSplits.values()).reduce((sum, val) => sum + val, 0) + 
        currentAmount;
      
      return (
        <View key={userId} style={styles.customSplitRow}>
          <Text>{member?.email}</Text>
          <TextInput
            value={currentAmount.toFixed(2)}
            onChangeText={(text) => {
              const num = parseFloat(text) || 0;
              setCustomSplits(prev => new Map(prev).set(userId, num));
            }}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Text variant="bodySmall">
            Remaining: {formatCurrency(remaining, currency)}
          </Text>
        </View>
      );
    })}
  </View>
)}
```

### API Changes

```typescript
// netlify/functions/transactions.ts

// Accept both formats
interface TransactionData {
  split_among?: string[]; // Equal split (backward compatible)
  splits?: Array<{user_id: string, amount: number}>; // Custom amounts
  split_mode?: 'equal' | 'custom';
}

// In POST handler:
if (transactionData.splits && Array.isArray(transactionData.splits)) {
  // Custom amounts provided
  const total = transactionData.splits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(total - transactionData.amount) > 0.01) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: 'Sum of split amounts must equal transaction amount' 
      })
    };
  }
  
  // Store as JSONB array of objects
  split_among: JSON.stringify(transactionData.splits)
} else if (transactionData.split_among) {
  // Equal split (existing behavior)
  split_among: transactionData.split_among
}
```

---

## Feature 2: Payment Tracking

### Database Changes

**Option A: Add columns to transactions table**
```sql
-- Add payment tracking to split_among structure
-- New format: 
-- '[{"user_id": "uuid1", "amount": 33.33, "is_paid": true, "paid_at": "2025-01-12T10:00:00Z"}]'

-- No schema change needed, just extend JSONB structure
```

**Option B: Junction Table (Better)**
```sql
-- Add to transaction_splits table
ALTER TABLE transaction_splits
ADD COLUMN is_paid BOOLEAN DEFAULT FALSE,
ADD COLUMN paid_at TIMESTAMP,
ADD COLUMN payment_method VARCHAR(50), -- 'cash', 'transfer', 'app', etc.
ADD COLUMN payment_notes TEXT;

CREATE INDEX idx_transaction_splits_paid_status 
ON transaction_splits(is_paid, paid_at);
```

### TypeScript Types

```typescript
export interface SplitEntry {
  user_id: string;
  amount: number;
  is_paid?: boolean;
  paid_at?: string;
  payment_method?: string;
  payment_notes?: string;
}
```

### Frontend Changes

**TransactionFormScreen.tsx - Payment UI:**

```typescript
// Show payment status in split list
{splitAmong.map(userId => {
  const split = transaction?.splits?.find(s => s.user_id === userId);
  const isPaid = split?.is_paid || false;
  
  return (
    <View key={userId} style={styles.splitRow}>
      <Checkbox ... />
      <Text>{member.email}</Text>
      <Text>{formatCurrency(split?.amount || equalAmount, currency)}</Text>
      {isPaid && (
        <Icon name="check-circle" color="green" />
      )}
    </View>
  );
})}
```

**New Component: PaymentTracker.tsx**

```typescript
// Component to mark payments
export const PaymentTracker: React.FC<{
  transaction: Transaction;
  onMarkPaid: (userId: string, isPaid: boolean) => void;
}> = ({ transaction, onMarkPaid }) => {
  return (
    <View>
      <Text variant="titleMedium">Payment Status</Text>
      {transaction.splits?.map(split => (
        <View key={split.user_id} style={styles.paymentRow}>
          <Text>{split.email}</Text>
          <Text>{formatCurrency(split.amount, transaction.currency)}</Text>
          <Switch
            value={split.is_paid || false}
            onValueChange={(paid) => onMarkPaid(split.user_id, paid)}
          />
          {split.is_paid && split.paid_at && (
            <Text variant="bodySmall">
              Paid: {formatDate(split.paid_at)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
};
```

### API Changes

```typescript
// New endpoint: PATCH /transactions/:id/splits/:userId/payment
if (httpMethod === 'PATCH' && path.includes('/splits/')) {
  const transactionId = parseInt(pathParts[pathParts.length - 3]);
  const userId = pathParts[pathParts.length - 1];
  
  const { is_paid, payment_method, payment_notes } = JSON.parse(event.body);
  
  // Update split payment status
  await supabase
    .from('transaction_splits')
    .update({
      is_paid: is_paid,
      paid_at: is_paid ? new Date().toISOString() : null,
      payment_method: payment_method || null,
      payment_notes: payment_notes || null
    })
    .eq('transaction_id', transactionId)
    .eq('user_id', userId);
}
```

---

## Feature 3: Balance Calculations

### Database: Views & Functions

```sql
-- View: Calculate balances between users in a group
CREATE OR REPLACE VIEW group_balances AS
WITH expense_splits AS (
  SELECT 
    t.group_id,
    t.paid_by,
    ts.user_id as owes_user,
    ts.amount as owes_amount,
    ts.is_paid
  FROM transactions t
  JOIN transaction_splits ts ON t.id = ts.transaction_id
  WHERE t.type = 'expense'
    AND t.group_id IS NOT NULL
    AND t.paid_by IS NOT NULL
    AND t.paid_by != ts.user_id -- Exclude self
),
balances AS (
  SELECT 
    group_id,
    paid_by as from_user,
    owes_user as to_user,
    SUM(owes_amount) FILTER (WHERE NOT is_paid) as unpaid_amount,
    SUM(owes_amount) FILTER (WHERE is_paid) as paid_amount,
    SUM(owes_amount) as total_amount
  FROM expense_splits
  GROUP BY group_id, paid_by, owes_user
)
SELECT 
  group_id,
  from_user,
  to_user,
  total_amount as amount_owed,
  unpaid_amount,
  paid_amount
FROM balances
WHERE total_amount > 0;

-- Function: Get net balance between two users
CREATE OR REPLACE FUNCTION get_net_balance(
  p_group_id UUID,
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  user1_owes_user2 DECIMAL;
  user2_owes_user1 DECIMAL;
BEGIN
  -- How much user1 owes user2
  SELECT COALESCE(SUM(amount_owed), 0) INTO user1_owes_user2
  FROM group_balances
  WHERE group_id = p_group_id
    AND from_user = p_user1_id
    AND to_user = p_user2_id;
  
  -- How much user2 owes user1
  SELECT COALESCE(SUM(amount_owed), 0) INTO user2_owes_user1
  FROM group_balances
  WHERE group_id = p_group_id
    AND from_user = p_user2_id
    AND to_user = p_user1_id;
  
  -- Net: positive means user1 owes user2, negative means user2 owes user1
  RETURN user1_owes_user2 - user2_owes_user1;
END;
$$ LANGUAGE plpgsql;
```

### API Endpoint

```typescript
// netlify/functions/balances.ts (new file)

export const handler: Handler = async (event) => {
  // GET /balances?group_id=xxx
  if (httpMethod === 'GET') {
    const groupId = event.queryStringParameters?.group_id;
    
    // Get all balances for the group
    const { data: balances } = await supabase
      .from('group_balances')
      .select('*')
      .eq('group_id', groupId);
    
    // Calculate net balances (simplify debts)
    const netBalances = calculateNetBalances(balances);
    
    return {
      statusCode: 200,
      body: JSON.stringify(netBalances)
    };
  }
};

function calculateNetBalances(balances: any[]) {
  // Group by user pairs and calculate net
  const netMap = new Map<string, number>();
  
  balances.forEach(b => {
    const key = [b.from_user, b.to_user].sort().join('-');
    const current = netMap.get(key) || 0;
    if (b.from_user < b.to_user) {
      netMap.set(key, current + b.amount_owed);
    } else {
      netMap.set(key, current - b.amount_owed);
    }
  });
  
  return Array.from(netMap.entries()).map(([key, amount]) => {
    const [user1, user2] = key.split('-');
    return {
      from_user: amount > 0 ? user1 : user2,
      to_user: amount > 0 ? user2 : user1,
      amount: Math.abs(amount)
    };
  });
}
```

### Frontend Component

**BalancesScreen.tsx:**

```typescript
export const BalancesScreen: React.FC<{
  groupId: string;
}> = ({ groupId }) => {
  const { data: balances } = useQuery({
    queryKey: ['balances', groupId],
    queryFn: () => fetchWithAuth(`/balances?group_id=${groupId}`).then(r => r.json())
  });
  
  return (
    <View>
      <Text variant="titleLarge">Who Owes Whom</Text>
      {balances?.map(balance => (
        <Card key={`${balance.from_user}-${balance.to_user}`}>
          <Card.Content>
            <Text>
              {getUserEmail(balance.from_user)} owes {getUserEmail(balance.to_user)}
            </Text>
            <Text variant="headlineSmall">
              {formatCurrency(balance.amount, currency)}
            </Text>
            {balance.unpaid_amount > 0 && (
              <Chip>
                {formatCurrency(balance.unpaid_amount)} unpaid
              </Chip>
            )}
          </Card.Content>
        </Card>
      ))}
    </View>
  );
};
```

---

## Feature 4: Split Info in Transaction List

### Frontend Changes

**Enhanced TransactionsSection.tsx (Ready-to-Use Code):**

```typescript
// Add to imports
import { Icon } from "react-native-paper";
import { GroupMember } from "../types";

// Update interface to accept groupMembers for email lookup
interface TransactionsSectionProps {
  items: Transaction[];
  loading: boolean;
  onEdit: (t: Transaction) => void;
  groupMembers?: GroupMember[]; // NEW: For email lookup
}

// Helper function to get user email
const getUserEmail = (userId: string, members?: GroupMember[]): string => {
  const member = members?.find(m => m.user_id === userId);
  return member?.email || userId.substring(0, 8) + "...";
};

// Helper to calculate equal split amount
const getEqualSplitAmount = (totalAmount: number, splitCount: number): number => {
  return Math.round((totalAmount / splitCount) * 100) / 100;
};

export const TransactionsSection: React.FC<TransactionsSectionProps> = ({
  items,
  loading,
  onEdit,
  groupMembers = [], // NEW prop
}) => {
  const theme = useTheme();

  return (
    <View style={[styles.section, { marginTop: 24 }]}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Transactions ({items.length})
      </Text>
      {loading ? (
        <ActivityIndicator size="small" style={{ marginVertical: 16 }} />
      ) : items.length > 0 ? (
        items.slice(0, 5).map((transaction, index) => {
          const isIncome = transaction.type === "income";
          const amountColor = isIncome ? "#10b981" : "#ef4444";
          const sign = isIncome ? "+" : "-";
          const hasSplit = transaction.split_among && transaction.split_among.length > 0;
          const splitCount = transaction.split_among?.length || 0;
          const equalAmount = hasSplit && transaction.amount 
            ? getEqualSplitAmount(transaction.amount, splitCount)
            : 0;

          return (
            <React.Fragment key={transaction.id}>
              <Card
                style={styles.transactionCard}
                mode="outlined"
                onPress={() => onEdit(transaction)}
              >
                <Card.Content style={styles.transactionContent}>
                  <View style={styles.transactionLeft}>
                    <Text
                      variant="titleSmall"
                      style={styles.transactionDescription}
                    >
                      {transaction.description || "No description"}
                    </Text>
                    <View style={styles.transactionMeta}>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {formatDate(transaction.date)}
                        {transaction.category && ` • ${transaction.category}`}
                      </Text>
                    </View>
                    
                    {/* NEW: Split Information */}
                    {hasSplit && transaction.type === 'expense' && (
                      <View style={styles.splitInfo}>
                        <View style={styles.splitHeader}>
                          <Icon 
                            source="account-group" 
                            size={14} 
                            color={theme.colors.onSurfaceVariant}
                          />
                          <Text
                            variant="bodySmall"
                            style={[styles.splitText, { color: theme.colors.onSurfaceVariant }]}
                          >
                            Split among {splitCount} {splitCount === 1 ? 'person' : 'people'}
                          </Text>
                        </View>
                        
                        {/* Show who paid */}
                        {transaction.paid_by && (
                          <Text
                            variant="bodySmall"
                            style={[styles.paidByText, { color: theme.colors.onSurfaceVariant }]}
                          >
                            Paid by: {getUserEmail(transaction.paid_by, groupMembers)}
                          </Text>
                        )}
                        
                        {/* Show per-person amount */}
                        {splitCount > 0 && (
                          <Text
                            variant="bodySmall"
                            style={[styles.splitAmountText, { color: theme.colors.primary }]}
                          >
                            {formatCurrency(equalAmount, transaction.currency)} per person
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <View style={styles.transactionRight}>
                    <Text
                      variant="titleMedium"
                      style={[styles.transactionAmount, { color: amountColor }]}
                    >
                      {sign}
                      {formatCurrency(
                        transaction.amount,
                        transaction.currency
                      )}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
              {index < Math.min(items.length, 5) - 1 && (
                <View style={{ height: 8 }} />
              )}
            </React.Fragment>
          );
        })
      ) : (
        // ... existing empty state ...
      )}
      {items.length > 5 && (
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.primary,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Showing 5 of {items.length} transactions
        </Text>
      )}
    </View>
  );
};

// Add to styles
const styles = StyleSheet.create({
  // ... existing styles ...
  splitInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)', // Light separator
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  splitText: {
    marginLeft: 4,
  },
  paidByText: {
    marginTop: 2,
    fontSize: 12,
  },
  splitAmountText: {
    marginTop: 2,
    fontWeight: '600',
    fontSize: 12,
  },
});
```

**Update GroupDetailsScreen.tsx to pass groupMembers:**

```typescript
// In GroupDetailsScreen.tsx, update TransactionsSection usage:
<TransactionsSection
  items={transactions}
  loading={txLoading}
  onEdit={handleEditTransaction}
  groupMembers={group.members || []} // NEW: Pass members for email lookup
/>
```

**Enhanced Transaction Card Visual Design:**

```
┌─────────────────────────────────────────────┐
│ Dinner at restaurant              -$100.00  │
│ 2025-01-12 • Food                           │
│ ─────────────────────────────────────────── │
│ 👥 Split among 3 people                      │
│ Paid by: alice@example.com                  │
│ $33.33 per person                            │
└─────────────────────────────────────────────┘
```

**Future Enhancement (when splits array is available):**

```typescript
// When transaction.splits is available (unequal splits):
{transaction.splits && transaction.splits.length > 0 && (
  <View style={styles.customSplitsPreview}>
    {transaction.splits.slice(0, 2).map(split => (
      <Chip 
        key={split.user_id} 
        compact 
        style={styles.splitChip}
        textStyle={{ fontSize: 11 }}
      >
        {getUserEmail(split.user_id, groupMembers)}: {formatCurrency(split.amount, transaction.currency)}
      </Chip>
    ))}
    {transaction.splits.length > 2 && (
      <Text variant="bodySmall" style={styles.moreSplits}>
        +{transaction.splits.length - 2} more
      </Text>
    )}
  </View>
)}

// Payment status (when payment tracking is implemented):
{transaction.splits && transaction.splits.some(s => s.is_paid !== undefined) && (
  <View style={styles.paymentStatus}>
    <Text variant="bodySmall" style={styles.paymentStatusText}>
      {transaction.splits.filter(s => s.is_paid).length} of {transaction.splits.length} paid
    </Text>
  </View>
)}
```

---

## Implementation Priority & Phases

### Phase 1: Display Split Info (Easiest)
**Effort:** 2-4 hours  
**Impact:** High (users can see split info)  
**Changes:**
- Update `TransactionsSection.tsx` to show split info
- Add helper function to get user emails
- No database changes needed

### Phase 2: Unequal Splits
**Effort:** 1-2 days  
**Impact:** High (core feature)  
**Changes:**
- Update form UI for custom amounts
- Modify API to accept custom splits
- Update database constraint/validation
- Migration strategy for existing data

### Phase 3: Payment Tracking
**Effort:** 2-3 days  
**Impact:** Medium (nice to have)  
**Changes:**
- Add payment status to split structure
- Create payment tracking UI
- Add API endpoint for marking payments
- Consider junction table migration

### Phase 4: Balance Calculations
**Effort:** 3-5 days  
**Impact:** High (very useful)  
**Changes:**
- Create database views/functions
- Build balances API endpoint
- Create balances screen component
- Add navigation to balances from group details

---

## Recommended Migration Path

### Step 1: Add Display (No Breaking Changes)
```typescript
// Just update UI to show existing split_among data
// Works with current JSONB array structure
```

### Step 2: Support Both Formats (Transition Period)
```typescript
// API accepts both:
// - split_among: ["uuid1", "uuid2"] (equal, existing)
// - splits: [{user_id: "uuid1", amount: 50}, ...] (custom, new)

// Frontend can work with both
const splits = transaction.splits || 
  transaction.split_among?.map(uid => ({
    user_id: uid,
    amount: transaction.amount / transaction.split_among.length
  }));
```

### Step 3: Migrate to Junction Table (When Ready)
```sql
-- Create transaction_splits table
-- Migrate data from split_among JSONB
-- Update all code to use new table
-- Remove split_among column
```

---

## Code Examples

### Helper Functions

```typescript
// utils/splits.ts

export function calculateEqualSplit(
  amount: number,
  userCount: number
): number {
  return Math.round((amount / userCount) * 100) / 100;
}

export function validateSplitAmounts(
  splits: SplitEntry[],
  totalAmount: number
): { valid: boolean; error?: string } {
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  const diff = Math.abs(sum - totalAmount);
  
  if (diff > 0.01) {
    return {
      valid: false,
      error: `Split amounts (${sum.toFixed(2)}) don't match total (${totalAmount.toFixed(2)})`
    };
  }
  
  return { valid: true };
}

export function calculateBalances(
  transactions: Transaction[]
): Map<string, Map<string, number>> {
  // Returns: Map<fromUserId, Map<toUserId, amount>>
  const balances = new Map();
  
  transactions.forEach(tx => {
    if (!tx.paid_by || !tx.splits) return;
    
    tx.splits.forEach(split => {
      if (split.user_id === tx.paid_by) return; // Skip self
      
      if (!balances.has(tx.paid_by)) {
        balances.set(tx.paid_by, new Map());
      }
      
      const userBalances = balances.get(tx.paid_by);
      const current = userBalances.get(split.user_id) || 0;
      userBalances.set(split.user_id, current + split.amount);
    });
  });
  
  return balances;
}
```

---

## UI/UX Considerations

### Unequal Splits UI
- Show remaining amount as user enters custom amounts
- Validate sum equals total before allowing save
- Show visual indicator if amounts don't add up
- Suggest "Make Equal" button to reset to equal split

### Payment Tracking UI
- Color code: Green = paid, Red = unpaid
- Show payment date and method
- Allow bulk mark as paid
- Show payment summary (X of Y paid)

### Balance Display
- Group by "You owe" vs "Owes you"
- Show net balance per person
- Highlight large outstanding amounts
- Add "Settle Up" button for zeroing balances

### Transaction List
- Compact view: Just show "Split: 3 people"
- Expanded view: Show full split details
- Visual indicators for payment status
- Quick actions: Mark as paid, view details

---

## Testing Strategy

### Unit Tests
- Split calculation functions
- Balance calculation logic
- Validation functions

### Integration Tests
- API endpoints with custom splits
- Payment status updates
- Balance calculations

### E2E Tests
- Create expense with unequal splits
- Mark payments
- View balances
- Settle up flow

---

## Performance Considerations

### Database
- Index on `transaction_splits(user_id, is_paid)` for balance queries
- Materialized view for group balances (refresh periodically)
- Consider caching balances for frequently accessed groups

### Frontend
- Memoize balance calculations
- Lazy load split details in transaction list
- Virtualize long lists of balances

---

## Security Considerations

### Authorization
- Users can only mark their own splits as paid
- Users can only view balances for groups they're in
- Validate all split amounts server-side

### Data Integrity
- Prevent negative split amounts
- Ensure split sum equals transaction amount
- Prevent duplicate payments

---

## Success Metrics

- **Adoption:** % of expenses using custom splits
- **Payment Rate:** % of splits marked as paid
- **User Engagement:** Frequency of balance checks
- **Error Rate:** Validation failures, data inconsistencies
