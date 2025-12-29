# Testing Deep Links with Development Deployment

## Recommended Approach

Deploy the web app to the development environment and test with the mobile app.

## Step-by-Step Setup

### 1. Deploy Web App to Development

```bash
cd mobile
npm run deploy:web:dev
```

This deploys to: `https://share-money--development.expo.app`

### 2. Set Environment Variable

Create or update `mobile/.env`:

```bash
EXPO_PUBLIC_APP_URL=https://share-money--development.expo.app
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Verify Verification Files

Check that the verification files are accessible:

```bash
# Check iOS file
curl https://share-money--development.expo.app/.well-known/apple-app-site-association

# Check Android file
curl https://share-money--development.expo.app/.well-known/assetlinks.json
```

Both should return JSON content (not 404).

### 4. Rebuild Mobile App

**Important**: Universal Links/App Links are configured at build time based on `EXPO_PUBLIC_APP_URL`.

**For Android:**
```bash
cd mobile
export EXPO_PUBLIC_APP_URL=https://share-money--development.expo.app
eas build --platform android --profile development
```

**For iOS:**
```bash
cd mobile
export EXPO_PUBLIC_APP_URL=https://share-money--development.expo.app
eas build --platform ios --profile development
```

Or use your local build script if you have one configured.

### 5. Install and Test

1. Install the development build on your device/emulator
2. Generate a share link in the app
3. Test the deep link:

**Android:**
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "https://share-money--development.expo.app/join/test-token"
```

**iOS Simulator:**
```bash
xcrun simctl openurl booted "https://share-money--development.expo.app/join/test-token"
```

## What to Expect

- ✅ Links will use: `https://share-money--development.expo.app/join/<token>`
- ✅ If app is installed: Opens app directly (Universal Links/App Links)
- ✅ If app not installed: Opens web page
- ✅ Deep link handler processes the token correctly

## Troubleshooting

### Links open in browser instead of app
- Verify app was rebuilt with the correct `EXPO_PUBLIC_APP_URL`
- Check verification files are accessible via HTTPS
- Reinstall app after rebuilding

### Verification files return 404
- Ensure files are in `mobile/public/.well-known/` directory
- Redeploy web app: `npm run deploy:web:dev`
- Check files are in `mobile/dist/.well-known/` after export

### App doesn't handle deep links
- Verify app was built with development profile
- Check `EXPO_PUBLIC_APP_URL` was set during build
- Ensure deep link handler code is working (test with custom scheme first)

