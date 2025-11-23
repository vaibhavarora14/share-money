# Senior Engineer Code Review: Profile Icon and Session Handling PR

## Overview
This PR implements user profile management and session handling improvements. Overall, the implementation is solid, but there are several areas that need attention from a security, performance, and maintainability perspective.

---

## 🔴 Critical Issues

### 1. **Race Condition in Profile Creation (Database Migration)**
**File:** `supabase/migrations/20250121000000_add_profiles.sql`

**Issue:** The trigger `on_auth_user_created` creates a profile automatically, but the API endpoint also tries to create profiles when they don't exist. This can lead to race conditions or duplicate key errors.

**Location:** Lines 49-63 (trigger) and `netlify/functions/profile.ts` lines 68-82, 124-139

**Recommendation:**
```sql
-- Use INSERT ... ON CONFLICT DO NOTHING to handle race conditions
INSERT INTO public.profiles (id, profile_completed)
VALUES (NEW.id, FALSE)
ON CONFLICT (id) DO NOTHING;
```

**Impact:** Medium - Could cause 500 errors during user signup if multiple requests happen simultaneously.

---

### 2. **Missing Input Validation on Profile Updates**
**File:** `netlify/functions/profile.ts`

**Issue:** The PUT endpoint accepts arbitrary fields without proper validation. Fields like `full_name`, `phone`, and `avatar_url` should be validated for:
- Length limits (enforced by DB but should be validated before)
- Format validation (phone number format, URL validation for avatar_url)
- SQL injection (mitigated by Supabase, but good practice)

**Location:** Lines 97-109

**Recommendation:**
```typescript
// Add validation helper
function validateProfileUpdate(data: Partial<Profile>): { valid: boolean; error?: string } {
  if (data.full_name !== undefined) {
    if (data.full_name.length > 255) {
      return { valid: false, error: 'Full name must be 255 characters or less' };
    }
    if (data.full_name.trim().length === 0) {
      return { valid: false, error: 'Full name cannot be empty' };
    }
  }
  
  if (data.phone !== undefined && data.phone) {
    // Basic phone validation
    const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
    if (!phoneRegex.test(data.phone)) {
      return { valid: false, error: 'Invalid phone number format' };
    }
  }
  
  if (data.avatar_url !== undefined && data.avatar_url) {
    try {
      new URL(data.avatar_url);
    } catch {
      return { valid: false, error: 'Invalid avatar URL format' };
    }
  }
  
  return { valid: true };
}
```

**Impact:** Medium - Could allow invalid data or potential security issues.

---

### 3. **Session Expiration Detection is Fragile**
**File:** `mobile/utils/errorMessages.ts`

**Issue:** The `isSessionExpiredError` function relies on string matching, which is brittle and may miss edge cases or new error formats.

**Location:** Lines 4-16

**Recommendation:**
```typescript
export function isSessionExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for specific error codes first
  if ('code' in error && (error.code === 401 || error.code === 'UNAUTHORIZED')) {
    return true;
  }

  const message = error.message.toLowerCase();
  const sessionExpiredPatterns = [
    /unauthorized/i,
    /not authenticated/i,
    /session (has )?expired/i,
    /token (has )?expired/i,
    /invalid.*token/i,
    /authentication.*failed/i,
  ];

  return sessionExpiredPatterns.some(pattern => pattern.test(message));
}
```

**Impact:** Low-Medium - May not catch all session expiration scenarios.

---

## 🟡 Important Issues

### 4. **Missing Index on Profiles Table**
**File:** `supabase/migrations/20250121000000_add_profiles.sql`

**Issue:** Only `profile_completed` is indexed, but queries will frequently filter by `id` (which is already the primary key, so this is actually fine). However, if you plan to query by `full_name` or `phone` for search features, those should be indexed.

**Location:** Line 23

**Recommendation:** Consider adding indexes if search functionality is planned:
```sql
-- Only if search by name is needed
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);
-- Only if search by phone is needed
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
```

**Impact:** Low - Performance issue only if search is added later.

---

### 5. **Profile Fetching on Every Render**
**File:** `mobile/hooks/useProfile.ts`

**Issue:** The `useProfile` hook fetches profile data on every mount, even if it's already cached. This could lead to unnecessary API calls.

**Location:** Lines 21-46

**Recommendation:** Consider using React Query or similar for caching:
```typescript
// Or implement simple cache with useMemo/useRef
const profileCache = useRef<{ data: Profile | null; timestamp: number } | null>(null);
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const fetchData = useCallback(async () => {
  // Check cache first
  if (profileCache.current && 
      Date.now() - profileCache.current.timestamp < CACHE_TTL) {
    setData(profileCache.current.data);
    setIsLoading(false);
    return;
  }
  
  // ... existing fetch logic
  // Update cache after fetch
  profileCache.current = { data: profile, timestamp: Date.now() };
}, [session]);
```

**Impact:** Low-Medium - Unnecessary network requests and potential performance impact.

---

### 6. **Error Handling Inconsistency**
**File:** `mobile/utils/api.ts` vs `mobile/utils/errorHandling.ts`

**Issue:** There are two different error handling mechanisms:
1. `api.ts` automatically signs out on 401 (lines 131-172)
2. `errorHandling.ts` also signs out on session expiration

This could lead to double sign-out attempts or inconsistent behavior.

**Location:** Multiple files

**Recommendation:** Centralize session expiration handling in one place. The `api.ts` approach is better since it's at the network layer. Consider removing session expiration handling from `errorHandling.ts` or making it a no-op if already handled.

**Impact:** Low - Code duplication and potential confusion.

---

### 7. **Missing Error Boundary for Profile Setup**
**File:** `mobile/App.tsx`

**Issue:** The profile setup screen is rendered outside the main error boundary context in some cases, which could lead to unhandled errors.

**Location:** Lines 193-204

**Recommendation:** Ensure all screens are within the ErrorBoundary, or add specific error handling for profile setup failures.

**Impact:** Low - Edge case, but could cause app crashes.

---

### 8. **Hardcoded Error Code String**
**File:** `netlify/functions/profile.ts`

**Issue:** Using magic string `'PGRST116'` for "not found" errors. This is PostgREST-specific and could break if Supabase changes error codes.

**Location:** Lines 68, 124

**Recommendation:**
```typescript
// Create a constant or helper function
const POSTGREST_NOT_FOUND_CODE = 'PGRST116';

// Or better: check the error message/type
if (error.code === 'PGRST116' || 
    (error as any).message?.includes('No rows') ||
    (error as any).hint?.includes('No rows')) {
  // handle not found
}
```

**Impact:** Low - Could break if Supabase updates error codes.

---

## 🟢 Suggestions & Improvements

### 9. **Type Safety Improvements**
**File:** `netlify/functions/profile.ts`

**Suggestion:** The `Profile` interface should match the database schema exactly. Consider using a shared type definition or generating types from the database schema.

**Location:** Lines 9-17

**Recommendation:** Use a shared types package or ensure types are in sync with migrations.

---

### 10. **Profile Icon Fallback Logic**
**File:** `mobile/components/ProfileIcon.tsx`

**Suggestion:** The fallback to email first letter is good, but consider adding a default avatar image or better visual feedback when profile data is loading.

**Location:** Lines 17-29

**Recommendation:** Show a loading state or skeleton while profile is being fetched.

---

### 11. **Profile Setup Validation**
**File:** `mobile/screens/ProfileSetupScreen.tsx`

**Suggestion:** Add phone number format validation on the client side before submitting.

**Location:** Lines 36-56

**Recommendation:**
```typescript
const validatePhone = (phone: string): boolean => {
  if (!phone.trim()) return true; // Optional field
  const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
  return phoneRegex.test(phone.trim());
};
```

---

### 12. **Database Migration Safety**
**File:** `supabase/migrations/20250121000000_add_profiles.sql`

**Suggestion:** The migration uses `CREATE TABLE IF NOT EXISTS` which is good, but consider adding a check for existing profiles table to prevent accidental re-runs.

**Recommendation:** Add a comment about migration idempotency or add explicit checks.

---

### 13. **API Response Consistency**
**File:** `netlify/functions/profile.ts`

**Suggestion:** When creating a profile in GET endpoint (line 82), you return 200, but in PUT endpoint (line 139), you return 201. This is actually correct (201 for creation, 200 for update), but ensure the client handles both correctly.

**Location:** Lines 82, 139

---

### 14. **Missing Transaction Safety**
**File:** `netlify/functions/profile.ts`

**Suggestion:** If profile updates involve multiple related operations in the future, consider using database transactions. Currently not needed, but good to keep in mind.

---

## ✅ Positive Aspects

1. **Good RLS Policies:** The Row Level Security policies are correctly implemented
2. **Centralized Error Handling:** Good effort to centralize error handling
3. **Type Safety:** TypeScript interfaces are well-defined
4. **User Experience:** Profile setup flow is well-designed
5. **Security:** Authentication is properly verified in API endpoints
6. **Code Organization:** Good separation of concerns between hooks, screens, and utilities

---

## 📋 Testing Recommendations

1. **Test race conditions:** Multiple simultaneous profile creation requests
2. **Test session expiration:** Various error scenarios and edge cases
3. **Test profile update validation:** Invalid inputs, SQL injection attempts (though mitigated by Supabase)
4. **Test profile setup flow:** New users, existing users, partial completions
5. **Test error handling:** Network failures, API errors, session expiration

---

## 🎯 Priority Actions

**Before Merge:**
1. Fix race condition in profile creation (Issue #1)
2. Add input validation for profile updates (Issue #2)
3. Improve session expiration detection (Issue #3)

**Nice to Have:**
4. Add caching to profile hook (Issue #5)
5. Centralize error handling (Issue #6)
6. Add client-side phone validation (Suggestion #11)

---

## Summary

This is a well-structured PR with good separation of concerns and security practices. The main concerns are around edge cases (race conditions, error handling) and some code duplication. The suggested improvements would make the codebase more robust and maintainable.

**Overall Assessment:** ✅ **Approve with requested changes**

The critical issues (#1, #2, #3) should be addressed before merging, but they're not blockers if you're comfortable with the current risk level for an MVP.
