# Caching Issue: App Not Showing Updates After Actions

## Problem

After performing actions (create, update, delete) on transactions, settlements, groups, or invitations, the UI does not immediately reflect changes. Users must manually refresh or navigate away and back to see updates.

## Root Cause

Inconsistent React Query cache invalidation strategies across mutations:
- Transaction mutations use `resetQueries()` with predicates
- Other mutations use `invalidateQueries()`
- Delete transaction uses manual cache manipulation (workaround for broken invalidation)
- `resetQueries()` only refetches active queries, missing inactive ones
- Predicate-based matching may miss queries with different key structures

## Affected Areas

- Transactions (create, update, delete)
- Settlements (create, update, delete)
- Groups (create, delete, member management)
- Invitations (create, cancel)
- Balances (may not update after transaction/settlement changes)

## Expected Behavior

After any mutation, the UI should immediately reflect changes without manual refresh.

## Proposed Solutions

1. Standardize cache invalidation strategy across all mutations
2. Use query keys from `queryKeys` utility consistently
3. Ensure active queries refetch immediately (use `refetchQueries()` or fix `invalidateQueries()` behavior)
4. Consider optimistic updates for better UX

## Steps to Reproduce

1. Navigate to a group
2. Create a new transaction
3. Transaction list doesn't show the new transaction
4. Navigate away and back to see the update

## Related Files

- `mobile/utils/queryClient.ts`
- `mobile/hooks/useTransactionMutations.ts`
- `mobile/hooks/useSettlementMutations.ts`
- `mobile/hooks/useGroupMutations.ts`
- `mobile/hooks/useInvitationMutations.ts`
- `mobile/utils/queryKeys.ts`

**Priority: High** - Affects core user experience and data consistency

