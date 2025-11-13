# Phase 2: View Balances

Closes #5

## Summary

Implements the "View Balances" feature allowing users to see their financial standing with other members, both overall and within specific groups.

## Features

- View who owes you money and who you owe money to
- See balances per group and overall balances
- Auto-updates when transactions are added/modified
- Backward compatible with `split_among` field

## Changes

**Backend:**
- New `/api/balances` endpoint (Netlify Function) for balance calculation

**Frontend:**
- New `BalancesSection` component with "You owe" and "You are owed" sections
- New `useBalances` hook for data fetching
- Integrated into `GroupDetailsScreen`
- Auto-invalidates balance queries on transaction changes
