## 🎯 Summary
This PR addresses a critical race condition in the user onboarding flow that prevented new users from correctly joining groups they were invited to. It also improves the "Pending Invitations" UI by properly filtering out non-pending states.

## 🔍 Root Cause Analysis (Backend)
The issue stemmed from an operational ordering conflict between the `handle_new_user` function and the `trg_auto_create_participant_for_member` trigger:
1.  **Previous Flow**: `INSERT INTO group_members` -> Trigger fires -> Creates **NEW** participant (colliding with existing) -> Logic attempts to link existing invited participant -> **Unique Constraint Violation** (swallowed).
2.  **Result**: The user was created, but the group membership failed silently, leaving the user orphaned from the group and the invitation stuck in "pending".

## 🛠 Technical Changes

### Database / Backend
- **Refactored `handle_new_user` (Migration `20250126000000`)**:
    - Inverted the operation order to **Link-First**.
    - **Step 1**: Lock and update the existing `participants` record (merging Email -> User ID).
    - **Step 2**: `INSERT INTO group_members`.
    - **Outcome**: When the insert trigger fires, it now detects the *already linked* participant and performs a harmless update instead of attempting a duplicate creation. This eliminates the race condition and ensures data integrity.

### Mobile / Frontend
- **Filtered Invitations List**:
    - Updates `GroupDetailsScreen` to strictly filter `status === 'pending'` for the invitations list.
    - Prevents "Expired", "Accepted", or "Cancelled" invitations from cluttering the "Pending" view, correcting the misleading UI.

## 🧪 Verification
- [x] **Manual Reproduction**: Confirmed that previously failed sign-ups now correctly result in group membership.
- [x] **Data Integrity**: Verified `participants` table shows correct transition from `invited` (email) to `member` (user_id).
- [x] **UI Check**: Verified that expired invitations no longer appear in the "Pending" list on the group details screen.

## 📜 Migration Notes
- Includes migration `20250126000000_fix_handle_new_user_order.sql`.
- A one-time bulk repair script was executed in production to fix existing stuck users (`sheebagayyurkhan@gmail.com`).
