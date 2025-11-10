# Group Invitation Feature - Test Plan

## Prerequisites

1. **Start Supabase locally:**
   ```bash
   supabase start
   ```

2. **Apply migrations:**
   ```bash
   supabase db reset  # This applies all migrations including the new invitations table
   ```

3. **Start Netlify Functions dev server:**
   ```bash
   npm run dev:server
   # Server should be running at http://localhost:8888
   ```

4. **Set environment variables** (if not already set):
   - Root `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Mobile `.env`: `EXPO_PUBLIC_API_URL=http://localhost:8888/api`

## Test Scenarios

### 1. Database Migration Tests

#### 1.1 Verify Table Creation
- [ ] Check that `group_invitations` table exists
- [ ] Verify all columns are present with correct types
- [ ] Verify indexes are created
- [ ] Verify unique constraint on (group_id, email) for pending invitations

**SQL to verify:**
```sql
-- Check table exists
SELECT * FROM information_schema.tables WHERE table_name = 'group_invitations';

-- Check columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'group_invitations';

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'group_invitations';
```

#### 1.2 Verify Functions
- [ ] Check `accept_group_invitation` function exists
- [ ] Check `accept_pending_invitations_for_user` function exists
- [ ] Verify functions have correct permissions

**SQL to verify:**
```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name IN ('accept_group_invitation', 'accept_pending_invitations_for_user');
```

#### 1.3 Verify RLS Policies
- [ ] Verify RLS is enabled on `group_invitations` table
- [ ] Test that users can only see invitations for their groups or their own email

### 2. API Endpoint Tests

#### 2.1 Create Invitation (POST /api/invitations)

**Test Case 2.1.1: Create invitation for non-existent user**
- [ ] Create a group as user A
- [ ] As user A (group owner), create invitation for `newuser@example.com`
- [ ] Verify invitation is created with status 'pending'
- [ ] Verify invitation has token and expires_at set (30 days from now)
- [ ] Verify response includes invitation details

**Test Case 2.1.2: Create invitation for existing user (should add directly)**
- [ ] Create user B with email `existing@example.com`
- [ ] As user A, create invitation for `existing@example.com`
- [ ] Verify user B is added to group_members directly
- [ ] Verify invitation is created and immediately accepted (or not created if user added directly)

**Test Case 2.1.3: Duplicate invitation prevention**
- [ ] Create invitation for `test@example.com`
- [ ] Try to create another invitation for same email and group
- [ ] Verify error: "A pending invitation already exists for this email"

**Test Case 2.1.4: Non-owner cannot create invitation**
- [ ] As user B (not owner), try to create invitation
- [ ] Verify 403 error: "Only group owners can create invitations"

**Test Case 2.1.5: Invalid email format**
- [ ] Try to create invitation with invalid email
- [ ] Verify 400 error: "Invalid email address format"

#### 2.2 List Invitations (GET /api/invitations)

**Test Case 2.2.1: List invitations for a group (as owner)**
- [ ] Create multiple invitations for different emails
- [ ] As group owner, GET `/api/invitations?group_id=<group_id>`
- [ ] Verify all invitations for the group are returned
- [ ] Verify invitations are ordered by created_at descending

**Test Case 2.2.2: List invitations by email (as invited user)**
- [ ] Create invitation for `user@example.com`
- [ ] As `user@example.com`, GET `/api/invitations?email=user@example.com`
- [ ] Verify invitation is returned

**Test Case 2.2.3: Non-owner cannot list group invitations**
- [ ] As user B (not owner), try to GET invitations for group
- [ ] Verify 403 error

**Test Case 2.2.4: User cannot see invitations for other emails**
- [ ] As user A, try to GET invitations for `other@example.com`
- [ ] Verify 403 error

#### 2.3 Accept Invitation (POST /api/invitations/:id/accept)

**Test Case 2.3.1: Accept invitation with matching email**
- [ ] Create invitation for `user@example.com`
- [ ] Sign up/login as `user@example.com`
- [ ] POST `/api/invitations/<invitation_id>/accept`
- [ ] Verify user is added to group_members
- [ ] Verify invitation status changes to 'accepted'
- [ ] Verify accepted_at timestamp is set

**Test Case 2.3.2: Cannot accept invitation for different email**
- [ ] Create invitation for `user1@example.com`
- [ ] Sign in as `user2@example.com`
- [ ] Try to accept invitation
- [ ] Verify error: "This invitation is not for your email address"

**Test Case 2.3.3: Cannot accept expired invitation**
- [ ] Create invitation and manually set expires_at to past date
- [ ] Try to accept invitation
- [ ] Verify error: "Invitation has expired"

**Test Case 2.3.4: Cannot accept already accepted invitation**
- [ ] Accept an invitation
- [ ] Try to accept it again
- [ ] Verify error: "Invitation is no longer valid"

#### 2.4 Cancel Invitation (DELETE /api/invitations/:id)

**Test Case 2.4.1: Owner cancels invitation**
- [ ] Create invitation
- [ ] As group owner, DELETE `/api/invitations/<invitation_id>`
- [ ] Verify invitation status changes to 'cancelled'
- [ ] Verify invitation is no longer in pending list

**Test Case 2.4.2: Non-owner cannot cancel invitation**
- [ ] Create invitation
- [ ] As user B (not owner), try to cancel invitation
- [ ] Verify 403 error

### 3. Integration Tests

#### 3.1 Add Member Flow (via group-members API)

**Test Case 3.1.1: Add non-existent user creates invitation**
- [ ] As group owner, POST to `/api/group-members` with email of non-existent user
- [ ] Verify response indicates invitation was created
- [ ] Verify invitation exists in database
- [ ] Verify response message: "Invitation sent successfully..."

**Test Case 3.1.2: Add existing user adds directly**
- [ ] Create user B
- [ ] As group owner, POST to `/api/group-members` with user B's email
- [ ] Verify user B is added to group_members
- [ ] Verify response includes member details (not invitation)

**Test Case 3.1.3: Add user with pending invitation accepts it**
- [ ] Create invitation for `user@example.com`
- [ ] Create user with email `user@example.com`
- [ ] As group owner, POST to `/api/group-members` with `user@example.com`
- [ ] Verify invitation is accepted
- [ ] Verify user is added to group

### 4. Auto-Acceptance Tests

#### 4.1 Sign Up Auto-Acceptance

**Test Case 4.1.1: New user signup with pending invitation**
- [ ] Create invitation for `newuser@example.com`
- [ ] Sign up new user with email `newuser@example.com`
- [ ] Verify user is automatically added to group
- [ ] Verify invitation status is 'accepted'
- [ ] Check console logs for "Auto-accepted X pending invitation(s) on sign up"

**Test Case 4.1.2: Multiple pending invitations**
- [ ] Create invitations for `user@example.com` in multiple groups
- [ ] Sign up as `user@example.com`
- [ ] Verify user is added to all groups
- [ ] Verify all invitations are accepted

#### 4.2 Sign In Auto-Acceptance

**Test Case 4.2.1: Existing user signin with pending invitation**
- [ ] Create user `user@example.com`
- [ ] Create invitation for `user@example.com`
- [ ] Sign in as `user@example.com`
- [ ] Verify user is automatically added to group
- [ ] Check console logs for "Auto-accepted X pending invitation(s) on sign in"

#### 4.3 Google Sign In Auto-Acceptance

**Test Case 4.3.1: Google signin with pending invitation**
- [ ] Create invitation for `googleuser@gmail.com`
- [ ] Sign in with Google using `googleuser@gmail.com`
- [ ] Verify user is automatically added to group
- [ ] Check console logs for "Auto-accepted X pending invitation(s) on Google sign in"

### 5. Expiration Tests

#### 5.1 Expiration Handling

**Test Case 5.1.1: Expired invitations are marked as expired**
- [ ] Create invitation
- [ ] Manually set expires_at to past date in database
- [ ] Try to accept invitation
- [ ] Verify error: "Invitation has expired"
- [ ] Verify invitation status is 'expired'

**Test Case 5.1.2: Expired invitations are filtered out**
- [ ] Create multiple invitations (some expired, some not)
- [ ] List invitations
- [ ] Verify only non-expired pending invitations are shown

### 6. Frontend UI Tests

#### 6.1 Add Member Screen

**Test Case 6.1.1: Invitation creation UI**
- [ ] Open Add Member screen
- [ ] Enter email of non-existent user
- [ ] Submit
- [ ] Verify success message: "Invitation sent successfully..."
- [ ] Verify modal closes

**Test Case 6.1.2: Direct member addition UI**
- [ ] Open Add Member screen
- [ ] Enter email of existing user
- [ ] Submit
- [ ] Verify success message: "Member added successfully!"
- [ ] Verify member appears in group details

#### 6.2 Group Details Screen

**Test Case 6.2.1: Display pending invitations**
- [ ] As group owner, view group details
- [ ] Verify "Pending Invitations" section appears
- [ ] Verify pending invitations are listed with:
  - Email address
  - Invited date
  - Expiration date
  - Cancel button

**Test Case 6.2.2: Invitation count in members section**
- [ ] Create invitations
- [ ] View group details
- [ ] Verify members section shows: "Members (X) (Y pending invitation(s))"

**Test Case 6.2.3: Cancel invitation from UI**
- [ ] View pending invitations
- [ ] Click cancel button on an invitation
- [ ] Confirm cancellation
- [ ] Verify invitation is removed from list
- [ ] Verify invitation status is 'cancelled' in database

**Test Case 6.2.4: Non-owner cannot see invitations section**
- [ ] As non-owner, view group details
- [ ] Verify "Pending Invitations" section is not visible

### 7. Edge Cases and Error Handling

#### 7.1 Edge Cases

**Test Case 7.1.1: User already a member**
- [ ] Add user to group
- [ ] Try to create invitation for same user
- [ ] Verify error: "User is already a member of this group"

**Test Case 7.1.2: Invitation for user who becomes member before accepting**
- [ ] Create invitation for `user@example.com`
- [ ] Manually add user to group (via direct member addition)
- [ ] Try to accept invitation
- [ ] Verify invitation is marked as accepted (no error, user already member)

**Test Case 7.1.3: Multiple invitations for same email in different groups**
- [ ] Create invitation for `user@example.com` in Group A
- [ ] Create invitation for `user@example.com` in Group B
- [ ] Verify both invitations exist
- [ ] Sign up as `user@example.com`
- [ ] Verify user is added to both groups

#### 7.2 Error Handling

**Test Case 7.2.1: Invalid invitation ID**
- [ ] Try to accept/cancel non-existent invitation ID
- [ ] Verify 404 error: "Invitation not found"

**Test Case 7.2.2: Missing required fields**
- [ ] POST to create invitation without group_id
- [ ] Verify 400 error: "Missing required fields"

**Test Case 7.2.3: Unauthorized access**
- [ ] Try to access invitations API without auth token
- [ ] Verify 401 error: "Unauthorized"

### 8. Performance Tests

#### 8.1 Performance

**Test Case 8.1.1: List invitations with many records**
- [ ] Create 50+ invitations for a group
- [ ] List invitations
- [ ] Verify response time is acceptable (< 1 second)

**Test Case 8.1.2: Auto-accept with many pending invitations**
- [ ] Create 20+ pending invitations for same email
- [ ] Sign up with that email
- [ ] Verify all invitations are accepted quickly
- [ ] Verify user is added to all groups

## Test Execution Checklist

### Setup
- [ ] Supabase is running locally
- [ ] Migrations are applied (including invitations table)
- [ ] Netlify Functions dev server is running
- [ ] Environment variables are set correctly
- [ ] Test users are created (or can be created during testing)

### Quick Smoke Test
1. [ ] Create a group
2. [ ] Create invitation for non-existent user
3. [ ] Verify invitation appears in group details
4. [ ] Sign up with invited email
5. [ ] Verify user is automatically added to group
6. [ ] Verify invitation status is 'accepted'

### Full Test Suite
- [ ] Run all Database Migration Tests (Section 1)
- [ ] Run all API Endpoint Tests (Section 2)
- [ ] Run all Integration Tests (Section 3)
- [ ] Run all Auto-Acceptance Tests (Section 4)
- [ ] Run all Expiration Tests (Section 5)
- [ ] Run all Frontend UI Tests (Section 6)
- [ ] Run all Edge Cases (Section 7)
- [ ] Run Performance Tests (Section 8)

## Test Data

### Test Users
- `owner@test.com` - Group owner
- `member@test.com` - Existing member
- `newuser@test.com` - New user (for invitations)
- `existing@test.com` - Existing user (for direct addition)

### Test Groups
- "Test Group 1" - Created by owner@test.com
- "Test Group 2" - Created by owner@test.com

## Notes

- All API tests can be done using `curl` or Postman
- Frontend tests require the mobile app to be running
- Database verification can be done via Supabase Studio (http://127.0.0.1:54323)
- Check console logs for auto-acceptance confirmation messages
- Use Supabase Studio to manually verify database state between tests

