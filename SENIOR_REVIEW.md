# Senior Engineer Code Review - View Balances Feature

**Review Date:** Current  
**Reviewer:** Senior Engineer  
**Status:** ⚠️ **APPROVED with Critical Fixes Required**

---

## Executive Summary

The implementation is solid with good architecture and proper separation of concerns. However, there are **critical logic bugs** in the balance calculation that must be fixed before production. Additionally, several edge cases and error handling improvements are needed.

**Overall Grade:** B+ (Good, but needs critical fixes)

---

## 🔴 CRITICAL ISSUES (Must Fix Before Merge)

### 1. **Balance Calculation Logic Bug - Self-Payment Edge Case**

**File:** `netlify/functions/balances.ts:157-166`

**Issue:** When the current user paid for an expense AND is included in the splits, the calculation is incorrect.

**Current Logic:**
```typescript
if (paidBy === currentUserId) {
  // They are owed money by everyone else in the splits
  for (const split of splits) {
    if (split.user_id !== currentUserId && memberIds.has(split.user_id)) {
      balanceMap.set(split.user_id, current + split.amount);
    }
  }
}
```

**Problem:** If User A pays $100 and splits among [A, B, C]:
- Current code: A is owed $66.67 (B's $33.33 + C's $33.34) ✅ Correct
- But if A pays $100 and splits among [A, B] only:
  - Current code: A is owed $50 (B's $50) ✅ Correct
- However, the logic doesn't handle the case where A pays but A is NOT in splits correctly

**Actually, wait - let me reconsider:** If A pays $100 and splits among [A, B, C]:
- A paid $100
- A owes $33.33 (their share)
- B owes $33.33
- C owes $33.34
- Net: A is owed $66.67 (B + C) ✅ This is correct!

**But there's still an issue:** What if A pays $100 and splits among [B, C] only (A not included)?
- Current code: A is owed $100 (B's $50 + C's $50) ✅ This is also correct!

**Re-evaluation:** The logic appears correct. However, there's a missing edge case:

**Edge Case:** What if the payer is NOT in the splits at all, but we're calculating balances?
- Example: A pays $100, splits among [B, C] only
- Current code correctly shows A is owed $100
- But what if we're calculating B's perspective? B should see they owe A $50, and C owes A $50.

**Actually, the code handles this correctly** because:
- For B: `currentUserSplit` exists (B is in splits), `paidBy !== currentUserId` (A paid), so B owes A $50 ✅
- For A: `paidBy === currentUserId`, so A is owed by B and C ✅

**Verdict:** The balance calculation logic is actually **correct**. No fix needed here.

---

### 2. **Division by Zero Risk**

**File:** `netlify/functions/balances.ts:133-134`

**Issue:** No validation that `splitCount > 0` before division.

```typescript
const splitCount = tx.split_among.length;
const splitAmount = totalAmount / splitCount; // ⚠️ Could divide by zero
```

**Fix Required:**
```typescript
const splitCount = tx.split_among.length;
if (splitCount === 0) {
  continue; // Skip invalid transaction
}
const splitAmount = totalAmount / splitCount;
```

**Impact:** Medium - Could cause runtime error with malformed data.

---

### 3. **parseFloat Without NaN Validation**

**File:** `netlify/functions/balances.ts:119, 128`

**Issue:** `parseFloat` can return `NaN`, which would propagate through calculations.

```typescript
const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
// If tx.amount is "invalid", parseFloat returns NaN
```

**Fix Required:**
```typescript
const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
if (isNaN(totalAmount) || totalAmount <= 0) {
  console.warn(`Invalid transaction amount: ${tx.amount} for transaction ${tx.id}`);
  continue; // Skip invalid transaction
}
```

**Impact:** Medium - Could cause incorrect balance calculations.

---

### 4. **Missing Response Validation in Frontend**

**File:** `mobile/hooks/useBalances.ts:20-21`

**Issue:** No check if response is OK before parsing JSON.

```typescript
const response = await fetchWithAuth(endpoint);
return response.json(); // ⚠️ What if response is not OK?
```

**Note:** Actually, `fetchWithAuth` throws on non-OK responses, so this is handled. But we should still validate the JSON structure.

**Fix Recommended:**
```typescript
const response = await fetchWithAuth(endpoint);
if (!response.ok) {
  throw new Error(`Failed to fetch balances: ${response.statusText}`);
}
const data: BalancesResponse = await response.json();
// Optional: Add runtime validation with zod
return data;
```

**Impact:** Low-Medium - Better error messages.

---

## 🟡 HIGH PRIORITY ISSUES

### 5. **Currency Handling Limitation**

**File:** `netlify/functions/balances.ts`

**Issue:** Overall balances aggregate amounts from different currencies without conversion.

**Current Behavior:** If Group 1 has USD transactions and Group 2 has EUR transactions, overall balances will incorrectly sum them.

**Recommendation:** 
- Document this limitation
- OR: Group balances by currency
- OR: Convert all to base currency (requires exchange rate API)

**Impact:** Medium - Feature limitation that should be documented.

---

### 6. **Missing Input Validation**

**File:** `netlify/functions/balances.ts:279`

**Issue:** No validation that `group_id` is a valid UUID format.

```typescript
const groupId = event.queryStringParameters?.group_id;
// No validation of UUID format
```

**Fix Recommended:**
```typescript
const groupId = event.queryStringParameters?.group_id;
if (groupId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
  return {
    statusCode: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Invalid group_id format' }),
  };
}
```

**Impact:** Low-Medium - Security/validation best practice.

---

### 7. **Error Handling: Silent Failures**

**File:** `netlify/functions/balances.ts:336-339`

**Issue:** Errors in balance calculation for one group are logged but the group is silently skipped.

```typescript
} catch (error) {
  console.error(`Error calculating balances for group ${gId}:`, error);
  // Continue with other groups
}
```

**Recommendation:** Consider returning partial results with error information, or at least include failed groups in response.

**Impact:** Low - UX improvement.

---

### 8. **Performance: Potential N+1 Query Pattern**

**File:** `netlify/functions/balances.ts:320-340`

**Issue:** Balance calculation is done sequentially for each group. For users in many groups, this could be slow.

**Current:**
```typescript
for (const gId of targetGroupIds) {
  const balances = await calculateGroupBalances(supabase, gId, currentUserId);
  // Sequential await
}
```

**Recommendation:** Consider parallelizing if there are many groups:
```typescript
const balancePromises = targetGroupIds.map(gId => 
  calculateGroupBalances(supabase, gId, currentUserId).catch(err => {
    console.error(`Error calculating balances for group ${gId}:`, err);
    return []; // Return empty array on error
  })
);
const balanceResults = await Promise.allSettled(balancePromises);
```

**Impact:** Low-Medium - Performance optimization for edge case (many groups).

---

## 🟢 MEDIUM PRIORITY ISSUES

### 9. **Component: Default Expanded State**

**File:** `mobile/components/BalancesSection.tsx:29`

**Issue:** Component starts collapsed (`expanded: false`), which might hide important information.

**Recommendation:** Consider starting expanded, or make it configurable via props.

**Impact:** Low - UX preference.

---

### 10. **Type Safety: Missing Response Validation**

**File:** `mobile/hooks/useBalances.ts`

**Issue:** No runtime validation that the API response matches `BalancesResponse` interface.

**Recommendation:** Add runtime validation (e.g., with zod) in development mode.

**Impact:** Low - Development/debugging aid.

---

### 11. **Accessibility: Missing Labels**

**File:** `mobile/components/BalancesSection.tsx`

**Issue:** IconButton and Pressable lack accessibility labels.

**Recommendation:**
```typescript
<IconButton
  icon={expanded ? "chevron-down" : "chevron-right"}
  accessibilityLabel={expanded ? "Collapse balances" : "Expand balances"}
  // ...
/>
```

**Impact:** Low - Accessibility improvement.

---

## ✅ POSITIVE ASPECTS

1. **Excellent Architecture:** Clear separation of concerns, well-structured
2. **Type Safety:** All `any` types removed, proper interfaces defined
3. **Security:** CORS is configurable, authentication properly handled
4. **Performance:** Email fetching parallelized, useMemo for sorting
5. **Error Handling:** Try-catch blocks in critical paths
6. **Backward Compatibility:** Handles both `transaction_splits` and `split_among`
7. **Cache Invalidation:** Proper React Query invalidation strategy
8. **Code Organization:** Clean, readable, maintainable

---

## 📋 REQUIRED FIXES (Before Merge)

1. ✅ Add division by zero check (Issue #2)
2. ✅ Add NaN validation for parseFloat (Issue #3)
3. ⚠️ Consider input validation for group_id (Issue #6) - Recommended but not blocking

---

## 📊 Code Quality Metrics

- **Type Safety:** 9/10 (excellent, all `any` removed)
- **Error Handling:** 7/10 (good, but missing some edge cases)
- **Performance:** 8/10 (good, with room for optimization)
- **Security:** 8/10 (good, CORS configurable)
- **Maintainability:** 9/10 (excellent structure)
- **Test Coverage:** 0/10 (no tests - should add)

---

## 🧪 Testing Recommendations

### Unit Tests Needed:
1. `calculateGroupBalances` with various scenarios:
   - User paid, others owe
   - Others paid, user owes
   - User paid and included in splits
   - User paid but NOT in splits
   - Edge cases: zero amounts, rounding, division by zero

### Integration Tests Needed:
1. API endpoint with authentication
2. Error scenarios (invalid group, unauthorized access)
3. Performance with large datasets

---

## Final Verdict

**Recommendation:** **APPROVE with Required Fixes**

The implementation is well-architected and follows best practices. The critical issues (#2, #3) are straightforward fixes that should be addressed before merge. The remaining items are improvements that can be handled in follow-up PRs.

**Required Actions:**
1. Fix division by zero risk
2. Add NaN validation for parseFloat
3. (Optional) Add input validation for group_id

Once these are fixed, this is ready for production.

---

## Review Checklist

- [x] Code follows project patterns
- [x] Error handling is appropriate (with noted improvements)
- [x] Security considerations addressed
- [x] Performance optimizations applied
- [x] Type safety enforced
- [ ] Tests added (recommended for future)
- [x] Documentation is clear
- [x] Backward compatibility maintained
