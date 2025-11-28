# PR Review: Multi-currency Support for Balances and Stats

## Overview
This PR implements multi-currency support across balances and statistics. The implementation correctly groups balances by currency and displays totals as currency breakdowns (e.g., "+ ₹500 + $100"). Overall, the changes are well-structured, but there are several areas that need attention.

## ✅ Strengths

1. **Consistent Currency Handling**: The use of `Map<string, number>` for currency grouping is appropriate and scalable.
2. **Proper Key Generation**: React keys now include currency (`${balance.user_id}-${balance.currency}`), preventing rendering issues with multi-currency balances.
3. **Backend Currency Support**: The backend correctly handles currency in balance calculations and settlements.
4. **Type Safety**: TypeScript types are properly updated to include `currency` field in `Balance` interface.

## 🔴 Critical Issues

### 1. **Array Mutation in BalancesScreen.tsx** (Lines 45-46)
```typescript
youOwe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
youAreOwed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
```

**Issue**: While `.filter()` creates new arrays, directly mutating them with `.sort()` is a code smell and could cause issues if the data structure changes. More importantly, this logic should be memoized for performance.

**Recommendation**: 
```typescript
const { youOwe, youAreOwed } = useMemo(() => {
  const owe = [...overallBalances.filter((b) => b.amount < 0)];
  const owed = [...overallBalances.filter((b) => b.amount > 0)];
  owe.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  owed.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { youOwe: owe, youAreOwed: owed };
}, [overallBalances]);
```

### 2. **Misleading Percentage Calculation** (GroupStatsScreen.tsx, Line 298)
```typescript
// Percentage is tricky with mixed currencies. We'll use the simplified totalValue for now.
const totalValue = Array.from(totalCosts.values()).reduce((a, b) => a + b, 0);
const percentage = totalValue === 0 ? 0 : (entry.totalValue / totalValue) * 100;
```

**Issue**: Adding different currencies together (e.g., $100 + ₹5000) is mathematically incorrect and will produce misleading percentages. This comment acknowledges the problem but doesn't solve it.

**Recommendation**: 
- Either show percentages per currency (e.g., "50% of USD costs, 30% of INR costs")
- Or remove percentage display when multiple currencies are present
- Or add a disclaimer: "Percentages calculated assuming 1:1 exchange rate (approximate)"

### 3. **Commented-Out Code in GroupDashboard.tsx** (Lines 76-92)
**Issue**: Large block of commented code explaining uncertainty about "My Cost" calculation logic. This should be:
- Either implemented if the logic is needed
- Or removed if not needed
- Or converted to a TODO/issue if it's a known limitation

**Recommendation**: Remove commented code and add a concise comment explaining the decision:
```typescript
// Note: Transactions without splits or split_among are not included in "My Cost"
// as we cannot determine the user's share without explicit split data.
```

## ⚠️ Important Issues

### 4. **Currency Default Handling Inconsistency**
- **Backend** (`balances/index.ts`, Line 110): Defaults to `'USD'` if currency is missing
- **Frontend** (`currency.ts`, Line 42): Defaults to `'INR'` via `getDefaultCurrency()`

**Issue**: This mismatch could cause confusion. If a transaction has no currency, backend stores/calculates in USD, but frontend displays in INR.

**Recommendation**: 
- Ensure all transactions have a currency set (database constraint or migration)
- Or align defaults between frontend and backend
- Document this behavior clearly

### 5. **Missing Currency Validation**
**Issue**: No validation that `balance.currency` is a valid currency code before formatting. If an invalid currency is returned from the API, `formatCurrency()` will fall back to USD symbol, which could be misleading.

**Recommendation**: Add validation:
```typescript
const validCurrency = CURRENCIES.find(c => c.code === balance.currency)?.code || defaultCurrency;
formatCurrency(amount, validCurrency);
```

### 6. **Settlement Currency Logic** (SettlementFormScreen.tsx, Line 61)
```typescript
const effectiveDefaultCurrency = settlement?.currency || balance?.currency || defaultCurrency || getDefaultCurrency();
```

**Issue**: If a user settles a balance in a different currency than the balance currency, this could create accounting inconsistencies. The form should either:
- Lock the currency to the balance currency when settling a specific balance
- Or warn the user if they change the currency

**Recommendation**: When `balance` is provided, lock the currency field to `balance.currency` and disable currency selection.

## 💡 Suggestions & Improvements

### 7. **Performance: Memoization in GroupDashboard**
The `formatTotals` function is recreated on every render. Consider memoizing it:
```typescript
const formatTotals = useCallback((totals: Map<string, number>) => {
  if (totals.size === 0) return formatCurrency(0, defaultCurrency);
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(" + ");
}, [defaultCurrency]);
```

### 8. **Code Duplication: formatTotals Function**
The `formatTotals` function is duplicated in:
- `GroupDashboard.tsx` (Line 103)
- `GroupStatsScreen.tsx` (Line 269)

**Recommendation**: Extract to `utils/currency.ts`:
```typescript
export function formatCurrencyTotals(
  totals: Map<string, number>, 
  defaultCurrency: string = getDefaultCurrency()
): string {
  if (totals.size === 0) return formatCurrency(0, defaultCurrency);
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(" + ");
}
```

### 9. **Backend: Currency Default in Settlements** (balances/index.ts, Line 193)
```typescript
const currency = settlement.currency || 'USD';
```

**Issue**: Hardcoded 'USD' default. Should use a configurable default or ensure settlements always have currency.

**Recommendation**: 
- Check if settlements table has a NOT NULL constraint on currency
- If not, consider adding it via migration
- Or use a shared constant for default currency

### 10. **Edge Case: Zero Balances with Different Currencies**
**Issue**: If a user has a $0.00 balance in USD and ₹0.00 in INR, both might be filtered out, but the logic should handle this consistently.

**Current behavior**: Backend filters out balances with `Math.abs(roundedAmount) > 0.01`, which is correct.

### 11. **Type Safety: Currency Code**
**Issue**: `currency` is typed as `string`, but should ideally be a union type or validated enum.

**Recommendation**: Consider creating a type:
```typescript
export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'JPY' | 'KRW' | 'CNY' | 'AUD' | 'CAD';
```

## 📝 Testing Considerations

1. **Multi-currency balances**: Test with balances in 3+ different currencies
2. **Currency switching**: Test settlement form when balance currency differs from default
3. **Edge cases**: 
   - Zero balances in multiple currencies
   - Invalid currency codes from API
   - Missing currency fields
4. **Performance**: Test with large numbers of transactions/balances in multiple currencies

## 🎯 Summary

**Overall Assessment**: ✅ **Good implementation with room for improvement**

The PR successfully implements multi-currency support, but has several issues that should be addressed:
- **Must Fix**: Array mutation, misleading percentages, commented code
- **Should Fix**: Currency default consistency, validation, settlement currency locking
- **Nice to Have**: Code deduplication, type safety improvements

**Recommendation**: Request changes to address critical issues (#1, #2, #3) before merging. Important issues (#4, #5, #6) should be addressed in a follow-up if not blocking.

---

**Reviewed by**: Senior Engineer Review
**Date**: 2025-01-21
