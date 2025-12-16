# PR Review: React Query Integration

## Overview
This PR successfully integrates `@tanstack/react-query` for improved data fetching and state management. The implementation follows React Query best practices with centralized query keys, proper cache invalidation, and optimistic updates.

## ✅ Strengths

1. **Centralized Query Keys**: Excellent use of `queryKeys.ts` for consistent key management
2. **Proper Cache Invalidation**: Good use of `invalidateQueries` to keep data fresh after mutations
3. **Optimistic Updates**: Implemented in transaction and settlement mutations for better UX
4. **Conditional Queries**: Proper use of `enabled` flags to prevent unnecessary requests
5. **Error Handling**: Consistent error handling patterns across hooks
6. **Type Safety**: Good TypeScript usage with proper generics

## 🔍 Issues & Recommendations

### 1. **Missing Persistence Implementation** ⚠️
**Issue**: `@tanstack/react-query-persist-client` is installed but not used, despite being mentioned in the PR description.

**Impact**: Users lose cached data on app restart, missing an opportunity to improve offline experience.

**Recommendation**: 
- Implement persistence using `createSyncStoragePersister` with AsyncStorage
- Configure which queries should be persisted (e.g., groups, profile)
- Add persistence to QueryClient configuration

```typescript
// Example implementation
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const persister = createSyncStoragePersister({
  storage: AsyncStorage,
});

// In QueryClient configuration
persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
});
```

### 2. **Inconsistent Query Key Patterns** ⚠️
**Issue**: Some hooks use `["key", null]` while others use conditional keys. This creates inconsistency.

**Location**: 
- `useActivity.ts:21` - uses `["activity", null]`
- `useBalances.ts:22` - uses `["balances", null]`
- `useTransactions.ts:40` - uses `["transactions", null]`

**Recommendation**: Standardize on either:
- Always use the query key factory function: `queryKeys.activity(groupId ?? "")`
- Or consistently use `null` pattern across all hooks

### 3. **Type Safety Issues** ⚠️
**Issue**: Multiple uses of `as any` casts reduce type safety.

**Locations**:
- `useTransactions.ts:76, 109, 144, 157` - `(variables as any).group_id`
- `useSettlements.ts:106` - `(variables as any).group_id`
- `useGroupMutations.ts:5` - `ReturnType<typeof useQueryClient>` in function parameter

**Recommendation**: 
- Define proper types for mutation variables
- Use type guards or proper type narrowing instead of `as any`

```typescript
// Example fix
interface CreateTransactionVariables {
  group_id: string;
  // ... other fields
}
```

### 4. **Missing Retry Configuration** 💡
**Issue**: No explicit retry configuration in QueryClient defaults.

**Recommendation**: Add retry logic for better resilience:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes('4')) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
```

### 5. **initialData May Mask Loading States** 💡
**Issue**: Some queries use `initialData` which can hide initial loading states.

**Locations**:
- `useActivity.ts:24` - `initialData: { activities: [], total: 0, has_more: false }`
- `useSettlements.ts:34` - `initialData: { settlements: [] }`
- `useTransactions.ts:43` - `initialData: []`

**Recommendation**: Consider using `placeholderData` instead if you want to show cached data while fetching, or remove `initialData` if you want to show proper loading states.

### 6. **QueryClient.clear() on Logout** 💡
**Issue**: `queryClient.clear()` in App.tsx line 115 clears ALL queries, which might be too aggressive.

**Current**:
```typescript
useEffect(() => {
  if (!session) {
    queryClientInstance.clear();
  }
}, [queryClientInstance, session?.user?.id]);
```

**Recommendation**: Consider clearing only user-specific queries:
```typescript
if (!session) {
  queryClientInstance.removeQueries(); // Removes all queries
  // Or more targeted:
  queryClientInstance.removeQueries({ queryKey: ['groups'] });
  queryClientInstance.removeQueries({ queryKey: ['profile'] });
  // etc.
}
```

### 7. **Missing Error Boundaries for Query Errors** 💡
**Issue**: While there's a global ErrorBoundary, individual query errors might benefit from more granular handling.

**Recommendation**: Consider adding error boundaries or error states at the component level for critical queries.

### 8. **StaleTime Documentation** 💡
**Issue**: Different `staleTime` values across hooks (30s, 60s) without clear rationale.

**Recommendation**: Add comments explaining why different stale times are used, or standardize on a few values with clear documentation.

### 9. **Prefetch Error Handling** ✅
**Good**: The `prefetchGroupData` function has error handling (line 250-252 in App.tsx), which is excellent.

### 10. **Optimistic Update Rollback** ✅
**Good**: Proper rollback logic in `onError` handlers for mutations (e.g., `useDeleteTransaction`, `useDeleteSettlement`).

## 📝 Minor Suggestions

1. **Query Key Factory Enhancement**: Consider adding a helper to invalidate all group-related queries:
   ```typescript
   invalidateGroupQueries: (groupId: string) => {
     // Invalidate all queries for a group
   }
   ```

2. **Consistent Return Types**: Some hooks return `{ data, isLoading, isFetching, error, refetch }` while others have additional fields. Consider standardizing the return interface.

3. **Loading State Distinction**: The distinction between `isLoading` and `isFetching` is good, but ensure components use the right one (isLoading for initial load, isFetching for background refetches).

## 🎯 Priority Actions

1. **High**: Implement persistence (react-query-persist-client) or remove from dependencies
2. **Medium**: Fix type safety issues (remove `as any` casts)
3. **Medium**: Add retry configuration
4. **Low**: Standardize query key patterns
5. **Low**: Document staleTime rationale

## ✅ Approval Status

**Conditional Approval** - The PR is well-structured and follows React Query best practices. However, the missing persistence implementation (mentioned in PR description) should be addressed before merge, or the dependency should be removed if not needed.

The code quality is good, and the integration is solid. With the above improvements, this will be production-ready.
