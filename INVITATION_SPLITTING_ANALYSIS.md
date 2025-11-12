# Invitation Splitting Logic Analysis

## Current Behavior

**Status:** ❌ **Pending invitations are NOT included in expense splitting**

### How It Works Currently

1. **Frontend (`GroupDetailsScreen.tsx`):**
   - Fetches `group.members` from `useGroupDetails()` hook
   - Fetches `invitations` separately from `useGroupInvitations()` hook
   - Only passes `group.members || []` to `TransactionFormScreen` (line 535)
   - Invitations are displayed separately in the UI but not used for splitting

2. **Backend (`groups.ts`):**
   - GET `/groups/:id` only returns members from `group_members` table
   - Invitations are stored in separate `group_invitations` table
   - Members and invitations are separate entities

3. **Backend Validation (`transactions.ts`):**
   - Validates `paid_by` and `split_among` against `group_members` table only
   - Only users in `group_members` table can be selected for splitting

### Data Model

```typescript
// GroupMember (from group_members table)
{
  id: string;
  group_id: string;
  user_id: string;  // Actual user ID (only exists after acceptance)
  role: 'owner' | 'member';
  joined_at: string;
}

// GroupInvitation (from group_invitations table)
{
  id: string;
  group_id: string;
  email: string;  // Email address (no user_id until accepted)
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by: string;
  expires_at: string;
}
```

**Key Difference:** Invitations only have an `email`, not a `user_id`, until they're accepted and converted to a member.

---

## Business Logic Consideration

### Should Pending Invitations Be Included?

**Arguments AGAINST including pending invitations:**
1. ✅ **No user_id yet** - Invitations only have email, not a user account
2. ✅ **Haven't accepted** - Person hasn't agreed to be part of the group
3. ✅ **May expire** - Invitation could expire before expense is paid
4. ✅ **May be cancelled** - Invitation could be cancelled
5. ✅ **Data integrity** - Can't validate against a user that doesn't exist
6. ✅ **Accounting accuracy** - Can't split with someone who isn't a member

**Arguments FOR including pending invitations:**
1. ⚠️ **Future planning** - Users might want to plan expenses for invited members
2. ⚠️ **UX convenience** - Show all potential participants

**Recommendation:** ❌ **Do NOT include pending invitations** - Current behavior is correct.

---

## Potential Issues

### Edge Case: Invitation Accepted After Expense Created

**Scenario:**
1. User A creates expense, splits with User B (pending invitation)
2. User B accepts invitation and becomes a member
3. Expense now has invalid `split_among` data (email instead of user_id?)

**Current Protection:**
- ✅ Backend validation prevents this - only `user_id` from `group_members` can be in `split_among`
- ✅ Frontend only shows actual members

**No action needed** - system is protected.

---

## If We Want to Include Pending Invitations

### Required Changes

1. **Frontend:**
   ```typescript
   // Combine members and pending invitations
   const allParticipants = [
     ...(group.members || []),
     ...(invitations
       .filter(inv => inv.status === 'pending')
       .map(inv => ({
         user_id: inv.email, // Use email as identifier
         email: inv.email,
         isPending: true
       }))
     )
   ];
   ```

2. **Backend Validation:**
   - Allow email addresses in `split_among` array
   - Validate against both `group_members` (user_id) and `group_invitations` (email)
   - Store as mixed array: `["uuid-1", "email@example.com", "uuid-2"]`

3. **Database Schema:**
   - `split_among` would need to support both UUIDs and emails
   - Current constraint allows this (JSONB array can contain strings)

4. **Data Migration:**
   - When invitation is accepted, update all expenses with that email in `split_among`
   - Replace email with user_id

### Complexity: **HIGH** ⚠️

This would require:
- Mixed data types in `split_among` (UUIDs and emails)
- Complex validation logic
- Data migration when invitations are accepted
- Handling expired/cancelled invitations
- Edge case handling

---

## Recommendation

**Keep current behavior** - Only include actual group members in expense splitting.

**Rationale:**
1. ✅ Simpler data model
2. ✅ Better data integrity
3. ✅ No edge cases with expired/cancelled invitations
4. ✅ Clear business logic: only split with active members
5. ✅ Matches user expectations (can't owe money to someone not in group)

**Alternative UX Solution:**
If users want to plan for future members, they can:
1. Wait for invitation to be accepted
2. Create expense after member joins
3. Use a note/description to mention future participants

---

## Code Verification

### Current Implementation ✅

**Frontend:**
- `GroupDetailsScreen.tsx:535` - Only passes `group.members`
- `TransactionFormScreen` - Only receives actual members

**Backend:**
- `transactions.ts:214-260` - Validates against `group_members` table only
- `groups.ts:167-171` - Only fetches from `group_members` table

**Conclusion:** System correctly excludes pending invitations. ✅

---

## Action Items

- [x] Document current behavior
- [x] Verify backend validation
- [x] Confirm this is intentional design
- [ ] Add comment in code explaining why only members are included
- [ ] Consider adding UI hint: "Only active members can be included in expense splits"
