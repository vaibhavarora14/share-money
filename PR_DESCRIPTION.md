# Phase 2: View Balances

## Related Issue
<!-- TODO: Link to the GitHub issue here, e.g., Closes #123 or Related to #123 -->

## User Story 4: View Balances

**As a user, I want to:**
- See who owes me money
- See who I owe money to
- View balances per group
- Understand my overall balance with each person

**Acceptance Criteria:**
- [x] User sees a list of people they owe money to
- [x] User sees a list of people who owe them money
- [x] Balances are shown per group
- [x] Overall balance with each person is calculated correctly
- [x] Balances update when expenses are added/modified

**Priority:** P0 (Critical)

## Implementation Summary

This PR implements the complete "View Balances" feature that allows users to see their financial standing with other members, both overall and within specific groups.

### Backend Changes
- **New API Endpoint**: `/api/balances` (Netlify Function)
  - Calculates balances per group and overall balances
  - Supports both `transaction_splits` (preferred) and `split_among` (backward compatibility)
  - Enriches balances with user email addresses when available
  - Handles authentication and authorization properly

### Frontend Changes
- **New Types**: Added `Balance`, `GroupBalance`, and `BalancesResponse` interfaces
- **New Hook**: `useBalances` for fetching balance data with React Query
- **New Component**: `BalancesSection` component that displays:
  - "You are owed" section (positive balances in green)
  - "You owe" section (negative balances in red)
  - Per-group breakdown with detailed balances
  - Empty state when no balances exist
- **Integration**: Added to `GroupDetailsScreen` between Members and Transactions sections
- **Auto-refresh**: Balance queries are invalidated when transactions are created/updated/deleted

### Key Features
- ✅ Shows who owes you money (positive amounts)
- ✅ Shows who you owe money to (negative amounts)
- ✅ Displays balances per group
- ✅ Calculates overall balance with each person
- ✅ Updates automatically when expenses are added/modified
- ✅ Handles backward compatibility with `split_among` field
- ✅ Proper error handling and loading states
- ✅ Responsive UI with collapsible sections

### Files Changed
- `netlify/functions/balances.ts` (new)
- `netlify.toml` (added redirect)
- `mobile/types.ts` (added balance types)
- `mobile/utils/queryKeys.ts` (added balance query keys)
- `mobile/hooks/useBalances.ts` (new)
- `mobile/hooks/useTransactionMutations.ts` (added balance invalidation)
- `mobile/components/BalancesSection.tsx` (new)
- `mobile/screens/GroupDetailsScreen.tsx` (integrated balances section)
