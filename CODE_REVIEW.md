# Senior Engineer Code Review

## Overview
The PR implements optimistic updates and cache invalidation for REST mutations. The approach is sound, but several issues need addressing before merge.

## Critical Issues

### 1. **Type Safety Violations** ⚠️

**Location:** `useInvitationMutations.ts:35`
```typescript
id: (data as any).invitation_id || `tmp-${Date.now()}`,
```

**Problem:** 
- Using `as any` bypasses type safety
- API returns `invitation` object (line 190 in invitations.ts), not `invitation_id`
- Hardcoded expiration date may not match API behavior

**Fix:**
```typescript
if (data && typeof data === 'object' && 'id' in data) {
  const invitation = data as GroupInvitation;
  // Use invitation.id directly
}
```

### 2. **Incomplete Optimistic Update Data** ⚠️

**Location:** `useGroupMutations.ts:68`
```typescript
{ id: `tmp-${Date.now()}`, group_id: variables.groupId, email: variables.email, status: "pending" }
```

**Problem:**
- Missing required fields: `invited_by`, `expires_at`, `created_at`
- This violates the `GroupInvitation` type contract
- Could cause runtime errors in components expecting these fields

**Fix:**
```typescript
const tempInvitation: GroupInvitation = {
  id: `tmp-${Date.now()}`,
  group_id: variables.groupId,
  email: variables.email,
  invited_by: '', // Will be populated on refetch
  status: 'pending',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
};
```

### 3. **Race Condition in Cache Updates** ⚠️

**Location:** `useTransactionMutations.ts:20-60`

**Problem:**
- Optimistic update in `onSuccess` happens AFTER server response
- If multiple mutations occur simultaneously, cache state can become inconsistent
- Should use `onMutate` for true optimistic updates

**Recommendation:**
Move optimistic updates to `onMutate` for immediate UI feedback, then validate in `onSuccess`.

### 4. **Missing Error Handling for Cache Updates** ⚠️

**Location:** Multiple files

**Problem:**
- Cache updates assume data structures exist
- No try-catch around `setQueryData` operations
- If cache structure is unexpected, mutations will fail silently

**Fix:**
```typescript
try {
  const previousData = queryClient.getQueryData<T>(queryKey);
  if (previousData) {
    queryClient.setQueryData(queryKey, updatedData);
  }
} catch (error) {
  console.error('Failed to update cache:', error);
  // Fallback to invalidation
  queryClient.invalidateQueries({ queryKey });
}
```

### 5. **Inconsistent Response Type Handling** ⚠️

**Location:** `useSettlementMutations.ts:40`

**Problem:**
- Assumes response structure `{ settlements: Settlement[] }`
- No validation that this matches actual API response
- Type assertion without runtime validation

**Fix:**
```typescript
const previousResponse = queryClient.getQueryData<SettlementsResponse>(
  queryKeys.settlements(variables.group_id)
);
if (previousResponse?.settlements) {
  // Safe to update
}
```

## Medium Priority Issues

### 6. **Transaction Sorting Assumption**

**Location:** `useTransactionMutations.ts:30`

**Problem:**
- Assumes transactions should be prepended (newest first)
- API might return different sort order
- Should verify API behavior or sort explicitly

### 7. **Duplicate Cache Invalidation**

**Location:** Multiple mutation hooks

**Problem:**
- Both optimistic updates AND invalidation happen
- This causes unnecessary refetches
- Should either update optimistically OR invalidate, not both

**Recommendation:**
- Use optimistic updates for immediate feedback
- Invalidate only on error or when data structure is uncertain

### 8. **Missing Current User Context**

**Location:** `useInvitationMutations.ts:38`

**Problem:**
- `invited_by: ''` is empty string
- Should use current user ID from auth context
- Missing import for `useAuth`

### 9. **Hardcoded Expiration Logic**

**Location:** `useInvitationMutations.ts:40`

**Problem:**
- Hardcoded 7-day expiration
- Should match API behavior or be configurable
- API might use different expiration logic

## Low Priority / Code Quality

### 10. **Inconsistent Naming**

- Some hooks use `variables`, others use destructured params
- Consider standardizing parameter naming

### 11. **Missing JSDoc Comments**

- Complex cache update logic lacks documentation
- Should document assumptions and edge cases

### 12. **Potential Memory Leaks**

- Temporary IDs like `tmp-${Date.now()}` accumulate in cache
- Should clean up temp entries after successful mutation

## Recommendations

### Immediate Actions:
1. ✅ Fix type safety issues (remove `as any`)
2. ✅ Complete optimistic update data structures
3. ✅ Add error handling for cache operations
4. ✅ Verify API response structures match assumptions

### Short-term Improvements:
1. Move optimistic updates to `onMutate` for better UX
2. Add runtime validation for API responses
3. Implement cleanup for temporary cache entries
4. Add unit tests for cache update logic

### Long-term Considerations:
1. Consider using React Query's `setQueryData` with updater functions
2. Implement a centralized cache update strategy
3. Add monitoring/logging for cache inconsistencies
4. Consider using TypeScript strict mode

## Testing Recommendations

1. **Unit Tests:**
   - Test cache updates with various data states
   - Test error scenarios and rollback behavior
   - Test concurrent mutations

2. **Integration Tests:**
   - Verify UI updates immediately after mutations
   - Test with slow network conditions
   - Test error recovery scenarios

3. **E2E Tests:**
   - Verify complete user flows (add member → see in list)
   - Test with multiple users simultaneously
   - Test edge cases (network failures, partial updates)

## Conclusion

The implementation follows good patterns but needs refinement for production readiness. Focus on type safety, error handling, and verifying API contracts before merge.

**Recommendation:** Request changes to address critical issues before approval.
