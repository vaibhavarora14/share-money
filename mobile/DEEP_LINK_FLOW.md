# Deep Link Flow - How Shareable Invite Links Work

This document explains the complete flow of how shareable invite links work, from generation to group joining.

## Overview

When a user shares an invite link, it follows this flow:
1. **Link Generation**: Creates a unique token and HTTP/HTTPS URL
2. **Link Sharing**: User copies/shares the link
3. **Link Opening**: Recipient clicks the link
4. **Platform Detection**: System determines if app is installed
5. **Deep Link Handling**: App receives and processes the link
6. **Group Joining**: User joins the group (with or without confirmation)

---

## 1. Link Generation

**Location**: `mobile/screens/AddMemberScreen.tsx`

When a user taps "Copy Link" or "Share":

```typescript
const getShareUrl = async (): Promise<string> => {
  // 1. Create a share link token in the database
  const token = await createGroupShareLinkRPC(groupId);
  
  // 2. Generate HTTP/HTTPS URL (not custom scheme)
  // This enables Universal Links (iOS) and App Links (Android)
  const baseUrl = process.env.EXPO_PUBLIC_APP_URL;
  return `${baseUrl}/join/${token}`;
  // Example: https://share-money.expo.app/join/6e8ef38c-7ff0-434d-a49a-28e5e487f676
}
```

**Database**: Creates a `group_invitations` record with:
- `token`: UUID (the token in the URL)
- `group_id`: The group being shared
- `email`: NULL (reusable link, not email-specific)
- `uses_count`: 0 (tracks how many times used)
- `max_uses`: NULL (unlimited uses)

---

## 2. Universal Links / App Links Setup

**How the system knows to open the app:**

### iOS (Universal Links)
1. **App Configuration** (`app.config.js`):
   ```javascript
   ios: {
     associatedDomains: [`applinks:${appUrlHostname}`]
     // Example: ["applinks:share-money.expo.app"]
   }
   ```

2. **Server Verification** (`/.well-known/apple-app-site-association`):
   ```json
   {
     "applinks": {
       "details": [{
         "appID": "BQ8LZKL6TG.com.vaibhavarora.sharemoney",
         "paths": ["/join/*"]
       }]
     }
   }
   ```

3. **How it works**:
   - iOS checks the verification file when app is installed
   - When user taps `https://share-money.expo.app/join/...`, iOS:
     - Checks if app is installed
     - Verifies the domain is associated with the app
     - Opens the app directly (if installed) OR opens in browser (if not)

### Android (App Links)
1. **App Configuration** (`app.config.js`):
   ```javascript
   android: {
     intentFilters: [{
       action: "VIEW",
       autoVerify: true,
       data: [{
         scheme: "https",
         host: appUrlHostname,
         pathPrefix: "/join"
       }]
     }]
   }
   ```

2. **Server Verification** (`/.well-known/assetlinks.json`):
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.vaibhavarora.sharemoney",
       "sha256_cert_fingerprints": ["07:3E:E0:4E:73:51:..."]
     }
   }]
   ```

3. **How it works**:
   - Android verifies the fingerprint when app is installed
   - When user taps the link, Android:
     - Opens app directly (if installed and verified) OR
     - Shows "Open with" dialog (if not verified) OR
     - Opens in browser (if app not installed)

---

## 3. Deep Link Handling in App

**Location**: `mobile/App.tsx`

### Step 1: Link Detection

```typescript
useEffect(() => {
  const handleDeepLink = async (event: { url: string }) => {
    // Extract token from URL: https://share-money.expo.app/join/<token>
    const match = event.url.match(/join\/([a-f0-9-]{36})/i);
    if (match && match[1]) {
      const token = match[1];
      // Process the token...
    }
  };
  
  // Listen for incoming links (when app is already running)
  const sub = Linking.addEventListener('url', handleDeepLink);
  
  // Check for initial URL (when app is opened from link)
  const getInitial = async () => {
    let url = await Linking.getInitialURL();
    if (Platform.OS === 'web' && !url) {
      url = window.location.href; // Fallback for web
    }
    if (url) handleDeepLink({ url });
  };
  
  getInitial();
  return () => sub.remove();
}, [session?.user?.id, handleJoinGroup]);
```

**What happens**:
- **App running**: `Linking.addEventListener` catches the link
- **App closed**: `Linking.getInitialURL()` gets the link that opened the app
- **Web**: Falls back to `window.location.href` if needed

### Step 2: User Authentication Check

```typescript
if (session?.user?.id) {
  // User is logged in → Join immediately (with confirmation)
  await handleJoinGroup(token, false);
} else {
  // User is NOT logged in → Save token and show preview
  await AsyncStorage.setItem('pending_invite_token', token);
  setJoinToken(token); // Shows JoinGroupPreview component
}
```

**Two paths**:
1. **Logged in**: Process join immediately
2. **Not logged in**: Save token, show preview, join after signup

---

## 4. Group Information Fetching

**Location**: `mobile/hooks/useGroupInvitations.ts`

```typescript
const info = await getGroupInfoFromTokenRPC(token);
// Returns: { group_name, member_count, is_valid }
```

**Database Function**: `get_group_info_from_token(p_token UUID)`
- Looks up the token in `group_invitations` table
- Validates the invitation is still valid
- Returns group name and member count
- Returns `is_valid: false` if token doesn't exist or is expired

---

## 5. Group Joining Logic

**Location**: `mobile/App.tsx` → `handleJoinGroup()`

### Scenario A: User is Logged In

```typescript
// Show confirmation dialog
Alert.alert(
  "Join Group",
  `Do you want to join "${info.group_name}"? (${info.member_count} members)`,
  [
    { text: "Cancel", style: "cancel" },
    {
      text: "Join",
      onPress: async () => {
        await acceptGroupInvitationRPC(token, session.user.id);
        // Refresh groups list
        // Clear URL on web
        Alert.alert("Success", "You have joined the group!");
      }
    }
  ]
);
```

### Scenario B: User is NOT Logged In

**Step 1**: Show preview (`JoinGroupPreview` component)
- Displays group name and member count
- Shows "Sign Up to Join" button

**Step 2**: User signs up
- After successful signup, session is created

**Step 3**: Auto-join after signup
```typescript
useEffect(() => {
  if (session?.user?.id) {
    const token = await AsyncStorage.getItem('pending_invite_token');
    if (token) {
      // Auto-join without confirmation (user came from invite link)
      await handleJoinGroup(token, true);
      await AsyncStorage.removeItem('pending_invite_token');
    }
  }
}, [session?.user?.id]);
```

**Auto-join flow** (when `autoJoin: true`):
```typescript
if (autoJoin) {
  // No confirmation dialog - join immediately
  await acceptGroupInvitationRPC(token, session.user.id);
  Alert.alert("Success", `You've joined "${info.group_name}"!`);
  // Clear URL on web
  if (Platform.OS === 'web') {
    window.history.replaceState({}, '', window.location.origin);
  }
}
```

---

## 6. Database Operations

### Accepting Invitation

**Function**: `accept_group_invitation(invitation_id UUID, accepting_user_id UUID)`

**What it does**:
1. Validates the invitation exists and is valid
2. Checks if user is already a member (prevents duplicates)
3. Creates `group_members` record
4. Increments `uses_count` on the invitation
5. Checks `max_uses` limit (if set)
6. Returns success/failure

**Security**: Uses Row Level Security (RLS) policies to ensure:
- Only authenticated users can accept
- Users can't join the same group twice
- Invitation limits are enforced

---

## 7. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER GENERATES LINK                                       │
│    AddMemberScreen → createGroupShareLinkRPC()              │
│    → Creates token in database                              │
│    → Returns: https://share-money.expo.app/join/<token>     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. USER SHARES LINK                                          │
│    Copy to clipboard or Share sheet                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. RECIPIENT CLICKS LINK                                      │
│    Opens: https://share-money.expo.app/join/<token>          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PLATFORM DETECTION                                        │
│    iOS: Checks apple-app-site-association                   │
│    Android: Checks assetlinks.json                          │
│    → App installed? → Open app                               │
│    → App not installed? → Open browser                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. APP RECEIVES DEEP LINK                                    │
│    App.tsx → handleDeepLink()                               │
│    → Extracts token from URL                                │
│    → Checks if user is logged in                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┴───────────────────┐
        │                                       │
        ↓                                       ↓
┌───────────────────────┐         ┌───────────────────────┐
│ USER IS LOGGED IN     │         │ USER NOT LOGGED IN    │
│                       │         │                       │
│ handleJoinGroup()     │         │ Save token to        │
│ → Show confirmation   │         │ AsyncStorage         │
│ → User confirms       │         │ → Show preview        │
│ → acceptGroupInv...  │         │ → User signs up      │
│ → Join group         │         │ → Auto-join after     │
│ → Success!           │         │   signup             │
└───────────────────────┘         └───────────────────────┘
```

---

## 8. Key Features

### ✅ Reusable Links
- Links can be used multiple times (unless `max_uses` is set)
- No email required - anyone with the link can join

### ✅ Security
- Token validation in database
- RLS policies prevent unauthorized access
- Duplicate join prevention

### ✅ User Experience
- Seamless app opening (Universal Links/App Links)
- Preview for logged-out users
- Auto-join after signup from invite link
- URL cleanup on web after joining

### ✅ Cross-Platform
- Works on iOS, Android, and Web
- Universal Links (iOS) and App Links (Android)
- Fallback to web if app not installed

---

## 9. Testing Deep Links

### iOS Simulator
```bash
xcrun simctl openurl booted "https://share-money.expo.app/join/test-token"
```

### Android Emulator
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "https://share-money.expo.app/join/test-token"
```

### Web
Just open the URL in a browser - it will work as a regular web link.

---

## 10. Troubleshooting

### Link opens in browser instead of app
- ✅ Verify verification files are accessible:
  - `https://share-money.expo.app/.well-known/apple-app-site-association`
  - `https://share-money.expo.app/.well-known/assetlinks.json`
- ✅ Check app was built with correct `associatedDomains`/`intentFilters`
- ✅ Reinstall app after verification files are deployed

### Link doesn't work after signup
- ✅ Check `pending_invite_token` is saved in AsyncStorage
- ✅ Verify session is fully initialized (500ms delay is intentional)
- ✅ Check token hasn't expired or been used up

### Web URL doesn't clear after join
- ✅ Check `window.history.replaceState()` is called
- ✅ Verify Platform.OS === 'web' check is working

---

## Summary

The deep link system provides a seamless experience:
1. **HTTP/HTTPS URLs** work everywhere (web, email, SMS, etc.)
2. **Universal Links/App Links** open the app directly when installed
3. **Smart handling** for logged-in vs. logged-out users
4. **Auto-join** after signup from invite link
5. **Secure** token-based validation in the database

This creates a user-friendly invitation system that works across all platforms! 🎉

