# PR Review: fix: improve app load stuck after inactive usage

## Overview
This PR addresses the issue of the app getting stuck in a loading state after inactive usage by adding comprehensive session handling, monitoring, and fallback mechanisms. The changes include enhanced Sentry integration, app state change handling, and user-facing retry functionality.

## ✅ Strengths

1. **Comprehensive Monitoring**: Excellent use of Sentry breadcrumbs to track auth flow and storage operations, which will be invaluable for debugging production issues.

2. **User Experience**: The retry button after 8 seconds provides users with a way to recover from stuck states, improving UX.

3. **Defensive Programming**: Multiple fallback mechanisms (10s timeout, app state change handling) show good defensive programming practices.

4. **Session Recovery**: The app state change handler that checks session on resume is a good approach for handling inactive usage scenarios.

## ⚠️ Issues & Concerns

### 1. **Race Condition in Fallback Timeout** (Critical)
**Location**: `mobile/contexts/AuthContext.tsx:145-161`

The fallback timeout doesn't check if `resolved` is already `true` when it fires. If `getSession()` resolves after 10 seconds but before the timeout callback executes, you could have a race condition.

**Recommendation**:
```typescript
const fallbackTimeout = setTimeout(() => {
  if (!resolved && mounted) {
    resolved = true; // Mark as resolved to prevent double execution
    Sentry.captureMessage("getSession timeout - forcing loading=false", {
      level: "warning",
      tags: { issue: "auth_timeout" },
    });
    setLoading(false);
    // ... rest of the code
  }
}, 10000);
```

### 2. **Sentry Breadcrumb Volume** (Performance)
**Location**: `mobile/supabase.ts:26-83`

Every AsyncStorage operation (getItem, setItem, removeItem) now logs a Sentry breadcrumb. This could generate a massive volume of breadcrumbs, especially during normal app usage. Supabase may call these methods frequently.

**Recommendation**:
- Consider using `level: "debug"` only for errors, not all operations
- Or add a flag to enable/disable verbose storage logging
- Consider sampling: only log every Nth operation or log only failures

```typescript
getItem: async (key: string): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(key);
    // Only log on errors or for specific keys
    if (key.includes('auth') || key.includes('session')) {
      Sentry.addBreadcrumb({
        category: "storage",
        message: `GET ${key}`,
        level: "debug",
        data: { found: value !== null },
      });
    }
    return value;
  } catch (err) {
    // Always log errors
    Sentry.addBreadcrumb({
      category: "storage",
      message: `GET ${key} FAILED`,
      level: "error",
      data: { error: (err as Error)?.message },
    });
    throw err;
  }
}
```

### 3. **Missing Error Handling in App State Change Handler**
**Location**: `mobile/contexts/AuthContext.tsx:204-239`

The `handleAppStateChange` function doesn't handle the case where `getSession()` fails but `mounted` is still true. The error breadcrumb is added, but `setLoading(false)` is only called in the catch block, not when there's an error from `getSession()`.

**Current code**:
```typescript
if (error) {
  Sentry.addBreadcrumb({ /* ... */ });
}
setSession(session); // This will set session to null if error occurred
setUser(session?.user ?? null);
```

**Recommendation**: Explicitly handle the error case:
```typescript
if (error) {
  Sentry.addBreadcrumb({
    category: "auth",
    message: "Session check on resume failed",
    level: "error",
    data: { error: error.message },
  });
  setLoading(false);
  return; // Don't update session state on error
}
```

### 4. **Retry Button Logic**
**Location**: `mobile/App.tsx:252-258`

The retry button calls `signOut()`, which clears the session. This might be too aggressive - users might lose their session unnecessarily. Consider:
- First attempting to refresh the session
- Or showing a more informative message about what "retry" does

**Recommendation**:
```typescript
onPress={async () => {
  Sentry.captureMessage("User clicked retry on stuck loading", {
    level: "info",
    tags: { user_action: "retry_loading" },
  });
  // Try refreshing session first
  try {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) {
      // Session refreshed successfully
      return;
    }
  } catch (err) {
    // If refresh fails, then sign out
    await signOut();
  }
}}
```

### 5. **Potential Memory Leak in App.tsx**
**Location**: `mobile/App.tsx:90-108`

The timeout for detecting stuck auth state doesn't account for the `loading` state changing. If `loading` changes from `true` to `false` and back to `true`, you could have multiple timeouts running.

**Recommendation**: The cleanup is already handled, but consider adding a ref to track the timeout:
```typescript
const stuckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  if (stuckTimeoutRef.current) {
    clearTimeout(stuckTimeoutRef.current);
  }
  
  stuckTimeoutRef.current = setTimeout(() => {
    if (loading) {
      // ... existing code
    }
  }, 15000);
  
  return () => {
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
    }
  };
}, [loading, session, user, profileLoading, profile]);
```

### 6. **Inconsistent Error Handling**
**Location**: `mobile/contexts/AuthContext.tsx:153-159`

The fallback timeout attempts to refresh the session, but doesn't handle errors from `refreshSession()`. This could lead to silent failures.

**Recommendation**:
```typescript
supabase.auth.refreshSession().then(({ data, error }) => {
  if (mounted && data.session) {
    setSession(data.session);
    setUser(data.session.user);
    applyUserToSentry(data.session);
  } else if (error) {
    Sentry.captureException(error, {
      tags: { issue: "auth_timeout_refresh_failed" },
    });
  }
}).catch((err) => {
  if (mounted) {
    Sentry.captureException(err, {
      tags: { issue: "auth_timeout_refresh_error" },
    });
  }
});
```

## 🔍 Code Quality Observations

1. **Good**: Extensive use of Sentry breadcrumbs for debugging
2. **Good**: Proper cleanup of timeouts and subscriptions
3. **Good**: Mounted flag prevents state updates after unmount
4. **Improvement**: Consider extracting magic numbers (8s, 10s, 15s) to constants
5. **Improvement**: The `resolved` flag pattern is good, but could be more explicit with a ref

## 📝 Suggestions

### 1. Extract Magic Numbers
```typescript
// constants/auth.ts
export const AUTH_TIMEOUTS = {
  RETRY_BUTTON_DELAY: 8000,
  SESSION_FETCH_TIMEOUT: 10000,
  STUCK_LOADING_DETECTION: 15000,
} as const;
```

### 2. Consider Debouncing App State Changes
The app state change handler fires every time the app becomes active. If the user quickly switches apps, this could cause multiple rapid session checks. Consider debouncing:

```typescript
let appStateCheckTimeout: NodeJS.Timeout | null = null;

const handleAppStateChange = async (nextAppState: AppStateStatus) => {
  if (nextAppState === "active") {
    if (appStateCheckTimeout) {
      clearTimeout(appStateCheckTimeout);
    }
    appStateCheckTimeout = setTimeout(async () => {
      // ... existing session check code
    }, 500); // Small delay to debounce rapid state changes
  }
};
```

### 3. Add Unit Tests
Consider adding tests for:
- Fallback timeout behavior
- App state change handling
- Retry button functionality
- Session refresh on timeout

## 🎯 Testing Recommendations

1. **Test stuck loading scenario**: Simulate a slow `getSession()` call (>10s) and verify fallback works
2. **Test app resume**: Put app in background, wait, then resume and verify session check
3. **Test retry button**: Verify it appears after 8s and functions correctly
4. **Test Sentry integration**: Verify breadcrumbs are being sent (in dev/staging)
5. **Test race conditions**: Rapidly mount/unmount AuthProvider to test cleanup

## 📊 Summary

**Overall Assessment**: ✅ **Approve with suggestions**

This PR addresses a real user experience issue with solid engineering practices. The Sentry integration will be valuable for debugging production issues. However, there are some edge cases and performance considerations that should be addressed before merging.

**Priority Fixes**:
1. Fix race condition in fallback timeout (Critical)
2. Reduce Sentry breadcrumb volume for storage operations (Performance)
3. Improve error handling in app state change handler (Important)

**Nice to Have**:
1. Extract magic numbers to constants
2. Add debouncing for app state changes
3. Improve retry button logic to attempt refresh before sign out

The code is well-structured and the approach is sound. With the suggested improvements, this will be a robust solution to the stuck loading issue.
