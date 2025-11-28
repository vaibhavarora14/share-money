# PR Review: Multi-currency Support for Balances and Stats

## Overview
This PR implements multi-currency support across balances and statistics. The implementation correctly groups balances by currency and displays totals as currency breakdowns (e.g., "+ ₹500 + $100"). The latest commit (0ef3116) has addressed several critical issues identified in the initial review.

## ✅ Strengths

1. **Consistent Currency Handling**: The use of `Map<string, number>` for currency grouping is appropriate and scalable.
2. **Proper Key Generation**: React keys now include currency (`${balance.user_id}-${balance.currency}`), preventing rendering issues with multi-currency balances.
3. **Backend Currency Support**: The backend correctly handles currency in balance calculations and settlements.
4. **Type Safety**: TypeScript types are properly updated to include `currency` field in `Balance` interface.
5. **✅ FIXED**: Array mutation issue resolved with proper `useMemo` implementation
6. **✅ FIXED**: Code duplication resolved - `formatTotals` extracted to shared utility
7. **✅ FIXED**: Commented code removed and replaced with concise comment

## ✅ Fixed Issues (Latest Commit 0ef3116)

### 1. **Array Mutation in BalancesScreen.tsx** ✅ FIXED
**Status**: Fixed in commit 0ef3116
- Now properly uses `useMemo` to avoid mutations
- Correctly creates new arrays before sorting

### 2. **Percentage Calculation** ✅ IMPROVED
**Status**: Improved in commit 0ef3116
- Now hides percentage when multiple currencies are present
- Shows "Multiple currencies" label instead of misleading percentage
- Only calculates percentage when single currency is involved
- **Note**: The implementation has some nested comments that could be cleaned up, but the logic is correct

### 3. **Commented-Out Code** ✅ FIXED
**Status**: Fixed in commit 0ef3116
- Removed large block of commented code
- Replaced with concise, clear comment explaining the decision

### 8. **Code Duplication: formatTotals** ✅ FIXED
**Status**: Fixed in commit 0ef3116
- Extracted `formatTotals` to `utils/currency.ts`
- Now used consistently across components

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

### 7. **Code Cleanup: Percentage Calculation Comments**
**Location**: `GroupStatsScreen.tsx` (Lines 290-305)
**Issue**: The percentage calculation logic has nested comments that could be simplified.

**Current code**:
```typescript
// Percentage is tricky with mixed currencies.
// Only show percentage if there is a single currency involved in the total costs.
const isMixedCurrency = totalCosts.size > 1;
let percentage = 0;

if (!isMixedCurrency && totalCosts.size === 1) {
   const totalValue = Array.from(totalCosts.values())[0];
   // We need to match the currency of the entry with the single currency in totalCosts
   // But wait, entry.amounts is also a Map.
   // If totalCosts has 1 currency, then entry.amounts should ideally also have that currency (or be empty).
   // Let's simplify: if totalCosts has > 1 currency, hide percentage.
   // If totalCosts has 1 currency, calculate percentage based on that currency's total.
   const currency = Array.from(totalCosts.keys())[0];
   const entryAmount = entry.amounts.get(currency) || 0;
   percentage = totalValue === 0 ? 0 : (entryAmount / totalValue) * 100;
}
```

**Recommendation**: Simplify comments:
```typescript
// Only calculate percentage when all costs are in a single currency
const isMixedCurrency = totalCosts.size > 1;
let percentage = 0;

if (!isMixedCurrency && totalCosts.size === 1) {
  const currency = Array.from(totalCosts.keys())[0];
  const totalValue = totalCosts.get(currency)!;
  const entryAmount = entry.amounts.get(currency) || 0;
  percentage = totalValue === 0 ? 0 : (entryAmount / totalValue) * 100;
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

**Overall Assessment**: ✅ **Good implementation - Most critical issues addressed**

### Status Update (After Latest Commit 0ef3116)

**✅ Fixed Issues**:
- Array mutation in BalancesScreen.tsx
- Misleading percentage calculation (now hides when mixed currencies)
- Commented-out code removed
- Code duplication resolved (formatTotals extracted)

**⚠️ Remaining Issues**:
- **Should Fix**: Currency default consistency between frontend/backend (#4)
- **Should Fix**: Missing currency validation (#5)
- **Nice to Have**: Settlement currency locking UI improvement (#6)
- **Nice to Have**: Code cleanup for percentage calculation comments (#7)
- **Nice to Have**: Type safety improvements (#11)

**Recommendation**: 
- ✅ **Approve with minor suggestions** - The critical issues have been addressed
- The remaining issues (#4, #5, #6) are important but not blocking
- Consider addressing them in a follow-up PR or as part of future improvements

---

**Reviewed by**: Senior Engineer Review  
**Initial Review Date**: 2025-01-21  
**Updated After Commit**: 0ef3116 (2025-11-28)
