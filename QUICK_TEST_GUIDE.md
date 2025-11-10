# Quick Test Guide - Group Invitations

## Current Status ✅

- ✅ Netlify dev server is running at http://localhost:8888
- ✅ Invitations function is loaded
- ✅ Database functions are accessible
- ✅ Migration appears to be applied

## Quick Test Steps

### Option 1: Using the Interactive Test Script

```bash
cd /Users/vaibhavarora/ShareMoney
./scripts/test-invitations-api.sh
```

This script will:
1. Guide you through getting an auth token
2. Create a test group
3. Create an invitation
4. List invitations
5. Optionally cancel an invitation

### Option 2: Manual Testing via Mobile App

1. **Start the mobile app:**
   ```bash
   npm run dev:mobile
   ```

2. **Test Flow:**
   - Sign in/up with a test account (e.g., `owner@test.com`)
   - Create a new group
   - Tap "Add Member" button
   - Enter email of non-existent user (e.g., `newuser@test.com`)
   - Verify you see: "Invitation sent successfully..."
   - Check group details - you should see "Pending Invitations" section
   - Sign up with `newuser@test.com`
   - Verify user is automatically added to the group

### Option 3: Manual API Testing with curl

#### 1. Get Auth Token
- Sign in via mobile app or Supabase Studio
- Get token from browser dev tools or Supabase Studio

#### 2. Create a Group
```bash
curl -X POST http://localhost:8888/api/groups \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Group","description":"Test"}'
```

Save the `id` from the response as `GROUP_ID`.

#### 3. Create Invitation (via invitations endpoint)
```bash
curl -X POST http://localhost:8888/api/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"group_id":"GROUP_ID","email":"newuser@test.com"}'
```

#### 4. Create Invitation (via group-members endpoint - should create invitation for non-existent user)
```bash
curl -X POST http://localhost:8888/api/group-members \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"group_id":"GROUP_ID","email":"newuser2@test.com"}'
```

#### 5. List Invitations
```bash
curl -X GET "http://localhost:8888/api/invitations?group_id=GROUP_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 6. Cancel Invitation
```bash
curl -X DELETE "http://localhost:8888/api/invitations/INVITATION_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Option 4: Verify in Supabase Studio

1. Open http://127.0.0.1:54323
2. Go to **Table Editor** > **group_invitations**
3. You should see:
   - All columns: id, group_id, email, invited_by, status, token, expires_at, created_at, accepted_at
   - Any invitations you created

4. Go to **SQL Editor** and run:
   ```sql
   -- Check table exists
   SELECT * FROM group_invitations LIMIT 5;
   
   -- Check functions exist
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_name IN ('accept_group_invitation', 'accept_pending_invitations_for_user');
   ```

## Test Scenarios to Verify

### ✅ Scenario 1: Create Invitation for Non-Existent User
- [ ] Add member with email that doesn't exist
- [ ] Verify invitation is created (not error)
- [ ] Check response indicates invitation was sent
- [ ] Verify invitation appears in group details UI

### ✅ Scenario 2: Auto-Acceptance on Signup
- [ ] Create invitation for `test@example.com`
- [ ] Sign up new user with `test@example.com`
- [ ] Verify user is automatically added to group
- [ ] Check console logs for "Auto-accepted X pending invitation(s)"
- [ ] Verify invitation status is 'accepted' in database

### ✅ Scenario 3: Direct Member Addition
- [ ] Create user `existing@test.com`
- [ ] Add `existing@test.com` to group
- [ ] Verify user is added directly (no invitation)
- [ ] Verify response shows member details

### ✅ Scenario 4: UI Display
- [ ] As group owner, view group details
- [ ] Verify "Pending Invitations" section is visible
- [ ] Verify invitations show email, dates, and cancel button
- [ ] Verify invitation count in members section header

### ✅ Scenario 5: Cancel Invitation
- [ ] Create invitation
- [ ] Click cancel button in UI
- [ ] Verify invitation is removed from list
- [ ] Verify invitation status is 'cancelled' in database

## Troubleshooting

### If invitations table doesn't exist:
```bash
# Apply migration manually via Supabase Studio SQL Editor
# Copy contents of: supabase/migrations/20250110100343_add_group_invitations.sql
# Paste and run in SQL Editor
```

### If API returns 500 errors:
- Check Netlify dev server logs: `tail -f /tmp/netlify-dev.log`
- Verify environment variables are set in `.env`
- Check Supabase is running: `supabase status`

### If auto-acceptance doesn't work:
- Check mobile app console logs
- Verify `accept_pending_invitations_for_user` function exists
- Check AuthContext logs for auto-accept messages

## Next Steps

1. Run the interactive test script: `./scripts/test-invitations-api.sh`
2. Or test via mobile app UI
3. Verify all scenarios above
4. Check database state in Supabase Studio

## Current Server Status

- ✅ Netlify Functions: Running on http://localhost:8888
- ✅ Supabase: Running on http://127.0.0.1:54321
- ✅ Supabase Studio: http://127.0.0.1:54323

Ready to test! 🚀

