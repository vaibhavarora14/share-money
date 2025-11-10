# Test Users

This document contains test user credentials for local development and testing.

## Default Test Users

### User 1: Group Owner
- **Email:** `testowner@test.com`
- **Password:** `testpass123`
- **Role:** Group owner (for creating groups and inviting members)
- **Use Case:** Primary test user for creating groups and managing invitations

### User 2: Auto User
- **Email:** `autouser@test.com`
- **Password:** `testpass123`
- **Role:** Regular member
- **Use Case:** Testing member addition and group interactions

### User 3: Final Test User
- **Email:** `finaltest@test.com`
- **Password:** `testpass123`
- **Role:** Regular member
- **Use Case:** Additional test scenarios

## Test Users for Invitation Feature

### New User (for invitation testing)
- **Email:** `newuser@test.com`
- **Password:** `testpass123`
- **Status:** Should be created during signup to test auto-acceptance
- **Use Case:** Testing invitation flow for non-existent users

### Existing User (for direct addition)
- **Email:** `existing@test.com`
- **Password:** `testpass123`
- **Status:** Pre-existing user
- **Use Case:** Testing direct member addition (bypassing invitation)

## Creating Test Users

### Option 1: Via Mobile App
1. Open the ShareMoney mobile app
2. Navigate to Sign Up screen
3. Enter email and password from above
4. Complete signup

### Option 2: Via Supabase Studio
1. Open Supabase Studio: http://127.0.0.1:54323
2. Go to **Authentication** > **Users**
3. Click **Add User** or **Create User**
4. Enter email and password
5. Click **Create User**

### Option 3: Via Supabase CLI
```bash
# Create user via Supabase CLI (if available)
supabase auth users create testowner@test.com --password testpass123
```

## Test Scenarios

### Scenario 1: Group Creation and Invitation
1. Sign in as `testowner@test.com`
2. Create a new group
3. Add member with email `newuser@test.com` (non-existent)
4. Verify invitation is created
5. Sign up as `newuser@test.com`
6. Verify user is automatically added to the group

### Scenario 2: Direct Member Addition
1. Sign in as `testowner@test.com`
2. Create a new group
3. Add member with email `existing@test.com` (existing user)
4. Verify user is added directly without invitation

### Scenario 3: Multiple Users
1. Sign in as `testowner@test.com`
2. Create a group
3. Add `autouser@test.com` and `finaltest@test.com` as members
4. Verify all members can see the group

## Notes

- **Password Policy:** All test users use the same password (`testpass123`) for simplicity
- **Email Verification:** In local development, email verification may be disabled
- **Password Reset:** Use Supabase Studio to reset passwords if needed
- **User Deletion:** Users can be deleted via Supabase Studio > Authentication > Users

## Security Warning

⚠️ **These credentials are for LOCAL DEVELOPMENT ONLY.**
- Never use these credentials in production
- Never commit real user credentials to version control
- Reset passwords regularly in development environments

## Viewing Users in Supabase Studio

1. Open http://127.0.0.1:54323
2. Navigate to **Authentication** > **Users**
3. You'll see all created users with their:
   - Email addresses
   - User IDs (UUIDs)
   - Creation dates
   - Last sign-in dates

## Quick Reference

| Email | Password | Purpose |
|-------|----------|---------|
| `testowner@test.com` | `testpass123` | Group owner, primary tester |
| `autouser@test.com` | `testpass123` | Regular member |
| `finaltest@test.com` | `testpass123` | Additional test scenarios |
| `newuser@test.com` | `testpass123` | Invitation testing (signup) |
| `existing@test.com` | `testpass123` | Direct addition testing |

