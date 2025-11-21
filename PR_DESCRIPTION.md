# Activity Feed & UI Revamp

Closes #9

## Summary

Implements a comprehensive Activity Feed feature that tracks all transaction and settlement changes, combined with a revamped UI that improves navigation and user experience. This addresses the lack of transaction change audit trails and enhances the overall app usability.

## 🎨 UI Improvements

### Navigation Revamp
- **4-Tab Primary Navigation**: Reorganized group details screen with dedicated tabs for:
  - **Transactions**: View and manage all transactions
  - **Activity Feed**: See all changes and history (NEW)
  - **Balances**: View who owes whom
  - **Members**: Manage group members

### Visual Enhancements
- **Material Icons**: Replaced emoji icons with Material Community Icons for better consistency
- **Color-Coded Activity Types**: 
  - 🟢 Green for created items
  - 🟠 Orange for updated items
  - 🔴 Red for deleted items
- **Improved Currency Display**: Added comma formatting for thousands (e.g., $1,000.00)
- **Better Date Formatting**: Timezone-aware relative and absolute timestamps
- **Enhanced Empty States**: Professional icons and messaging

## 📊 Activity Feed Features

### Comprehensive Tracking
- **Transaction History**: Tracks all create, update, and delete operations
- **Settlement History**: Integrated settlement changes into activity feed
- **User Attribution**: Shows who made each change with email/name display
- **Change Details**: Displays what fields were modified (amount, description, splits, etc.)
- **Split Tracking**: Shows when users are added/removed from transaction splits

### Smart Grouping
- Activities grouped by date (Today, Yesterday, X days ago, or specific dates)
- Chronological ordering with most recent first
- Clear visual separation between date groups

### User-Friendly Descriptions
- Human-readable activity descriptions (e.g., "John updated Amount: $50.00 → $75.00")
- Handles currency formatting with proper symbols
- Shows split participant changes with actual user names

## 🔧 Technical Improvements

### Backend
- **Database Triggers**: PostgreSQL triggers automatically capture all changes
- **History Table**: `transaction_history` table stores change diffs and snapshots
- **API Endpoint**: New `/api/activity` endpoint for fetching activity feed
- **Batch User Fetching**: Optimized email fetching with parallel requests
- **Type Safety**: Comprehensive TypeScript interfaces for all data structures

### Frontend
- **Custom Hook**: `useActivity` hook for data fetching with React Query
- **Error Boundaries**: Client-side error handling for graceful failures
- **Constants Management**: Centralized UI constants and configuration
- **Type Safety**: Replaced `any` types with proper type guards

### Currency Handling
- **Consistent Formatting**: Unified currency formatting across frontend and backend
- **Multi-Currency Support**: Supports USD, INR, EUR, GBP, JPY, KRW, CNY, AUD, CAD
- **Comma Separators**: All amounts display with thousands separators
- **Error Messages**: Formatted currency in validation error messages

## 📁 Files Changed

### Backend
- `netlify/functions/activity.ts` - Activity feed API endpoint
- `netlify/functions/activityDescriptions.ts` - Description generation logic
- `netlify/functions/currency.ts` - Currency formatting utilities
- `netlify/functions/transactions.ts` - Updated error messages
- `supabase/migrations/20250120000000_add_transaction_history.sql` - Database schema

### Frontend
- `mobile/components/ActivityFeed.tsx` - Activity feed component
- `mobile/components/ActivityFeed.styles.ts` - Activity feed styles
- `mobile/hooks/useActivity.ts` - Activity data fetching hook
- `mobile/utils/activityDescriptions.ts` - Frontend formatting utilities
- `mobile/utils/currency.ts` - Currency formatting with comma separators
- `mobile/screens/GroupDetailsScreen.tsx` - Revamped UI with 4-tab navigation
- `mobile/constants/activityFeed.ts` - UI constants
- `mobile/types.ts` - Type definitions

## 🎯 Key Benefits

1. **Transparency**: Users can now see complete history of all changes
2. **Accountability**: Clear attribution of who made what changes
3. **Better UX**: Improved navigation and visual consistency
4. **Professional Appearance**: Material Design icons and proper formatting
5. **Maintainability**: Type-safe code with proper error handling

## 🧪 Testing Recommendations

- Test activity feed with various transaction operations (create, update, delete)
- Verify currency formatting across different currencies
- Test with large numbers to ensure comma formatting works
- Verify date grouping and timezone handling
- Test error scenarios and edge cases
