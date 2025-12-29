# Universal Links & App Links Setup

This document explains how to set up Universal Links (iOS) and App Links (Android) for shareable invite links.

## What Are Universal Links / App Links?

Universal Links (iOS) and App Links (Android) allow HTTP/HTTPS URLs to:
- **Open the app directly** if the app is installed
- **Fallback to web** if the app is not installed
- Work seamlessly across platforms

## Current Configuration

The app is configured to use Universal Links/App Links. Share links are generated as:
```
https://share-money.expo.app/join/<token>
```

## Expo Hosting Setup

The verification files are located in `mobile/public/.well-known/` and should be automatically included when you deploy.

### Deployment Commands

**Production:**
```bash
cd mobile
npm run deploy:web
# or: npx expo export -p web && npx eas deploy --prod
```

**Development:**
```bash
cd mobile
npm run deploy:web:dev
# or: npx expo export -p web && npx eas deploy --alias development
```

**Preview:**
```bash
cd mobile
npm run deploy:web:preview
# or: npx expo export -p web && npx eas deploy --alias preview
```

### Deployment URLs

Each deployment gets its own URL:
- **Production**: `https://share-money.expo.app` (or your custom domain)
- **Development**: `https://share-money--development.expo.app` (or custom dev domain)
- **Preview**: `https://share-money--preview.expo.app` (or custom preview domain)

**Note:** After exporting, verify the files are in the `dist/` directory:
```bash
ls -la mobile/dist/.well-known/
```

If the files are not automatically included, you may need to manually copy them:
```bash
cp -r mobile/public/.well-known mobile/dist/
```

### Verification Files

These files will be deployed to each environment:
- Production: `https://share-money.expo.app/.well-known/apple-app-site-association`
- Development: `https://share-money--development.expo.app/.well-known/apple-app-site-association`
- Preview: `https://share-money--preview.expo.app/.well-known/apple-app-site-association`

**Important:** Universal Links/App Links are typically configured for production only. If you need them for dev/preview, you'll need to:
1. Set `EXPO_PUBLIC_APP_URL` to the dev/preview URL when deploying
2. Rebuild the mobile apps with the updated `associatedDomains`/`intentFilters`

## Required Values

✅ **Apple Developer Team ID**: Already configured (`BQ8LZKL6TG`)

⏳ **Android SHA256 Fingerprint**: Still needs to be added to `assetlinks.json`

To get your Android SHA256 fingerprint:

## Server-Side Setup Required

### 1. iOS Universal Links

You need to host an `apple-app-site-association` file on your web server.

**File location:** `mobile/public/.well-known/apple-app-site-association`

**File content:**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.vaibhavarora.sharemoney",
        "paths": ["/join/*"]
      }
    ]
  }
}
```

**To get your Apple Developer Team ID:**
1. Go to https://developer.apple.com/account
2. Your Team ID is shown in the top right corner (format: `ABC123DEF4`)
3. Or check in Xcode: Preferences > Accounts > Select your team > Team ID

**Important:**
- Replace `TEAM_ID` in the file with your actual Team ID
- File must be served with `Content-Type: application/json` (no `.json` extension)
- Must be accessible via HTTPS
- File must be less than 128KB
- Expo hosting should serve this automatically from the `public/` directory

### 2. Android App Links

You need to host an `assetlinks.json` file on your web server.

**File location:** `mobile/public/.well-known/assetlinks.json`

**File content:**
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.vaibhavarora.sharemoney",
    "sha256_cert_fingerprints": [
      "YOUR_APP_SHA256_FINGERPRINT"
    ]
  }
}]
```

**To get SHA256 fingerprint:**

For EAS builds (recommended):
1. Go to https://expo.dev/accounts/share-money/projects/share-money/credentials
2. Select Android > Production credentials
3. Copy the SHA256 fingerprint from the keystore details
4. Or run: `eas credentials` and select Android > Production

For local debug builds:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```
Look for "SHA256:" in the output and copy the value (remove colons and spaces).

**Important:**
- Replace `YOUR_APP_SHA256_FINGERPRINT` in the file with your actual fingerprint
- Must be accessible via HTTPS
- Must return `Content-Type: application/json`
- File must be less than 100KB
- Expo hosting should serve this automatically from the `public/` directory

## Testing

### iOS Testing
1. Long-press a share link in Messages/Notes
2. Should show "Open in ShareMoney" option
3. Tap to open app directly

### Android Testing
1. Click a share link
2. Should open app directly (no "Open with" dialog)
3. If app not installed, opens in browser

## Verification

### iOS
```bash
# Test Universal Links
xcrun simctl openurl booted "https://share-money.expo.app/join/test-token"
```

### Android
```bash
# Test App Links
adb shell am start -a android.intent.action.VIEW -d "https://share-money.expo.app/join/test-token"
```

### Verify Files Are Accessible

After deploying, verify the files are accessible:
```bash
# Check iOS file
curl https://share-money.expo.app/.well-known/apple-app-site-association

# Check Android file
curl https://share-money.expo.app/.well-known/assetlinks.json
```

Both should return JSON content (not 404).

## Troubleshooting

### Links open in browser instead of app
- Verify server files are accessible via HTTPS
- Check file content-type headers
- Ensure paths match exactly (`/join/*`)
- Clear app data and reinstall

### iOS: "Open in ShareMoney" not showing
- Verify Team ID in apple-app-site-association
- Check file is served without .json extension
- Ensure Content-Type is application/json

### Android: "Open with" dialog appears
- Verify SHA256 fingerprint matches
- Check assetlinks.json is accessible
- Ensure autoVerify: true in intentFilters

## Production Checklist

- [x] ✅ Update `TEAM_ID` in `mobile/public/.well-known/apple-app-site-association` with your Apple Developer Team ID (Already done: `BQ8LZKL6TG`)
- [x] ⏳ Update `YOUR_APP_SHA256_FINGERPRINT` in `mobile/public/.well-known/assetlinks.json` with your Android SHA256 fingerprint
  - Run: `./scripts/get-android-fingerprint.sh` for help
  - Or check: https://expo.dev/accounts/share-money/projects/share-money/credentials
- [x] Set `EXPO_PUBLIC_APP_URL=https://share-money.expo.app` in your environment (for EAS builds)
- [x] Deploy web app: `cd mobile && npx expo export -p web && npx eas deploy --prod`
- [ ] Verify files are accessible:
  - `https://share-money.expo.app/.well-known/apple-app-site-association`
  - `https://share-money.expo.app/.well-known/assetlinks.json`
- [ ] Test on real iOS device (long-press link, should show "Open in ShareMoney")
- [ ] Test on real Android device (click link, should open app directly)
- [ ] Rebuild iOS app with updated associatedDomains configuration
- [ ] Rebuild Android app with updated intentFilters configuration

