# iOS Build and Submission Guide

This guide covers building iOS apps and submitting them to the App Store via EAS.

## Prerequisites

### 1. Install Xcode
- Install from Mac App Store
- Open and accept license agreement
- Verify: `xcodebuild -version`

### 2. Install Fastlane
```bash
sudo gem install fastlane
# or
brew install fastlane
```

### 3. Apple Developer Account
- Enroll in Apple Developer Program ($99/year)
- Create app in App Store Connect
- Get your Team ID from https://developer.apple.com/account

### 4. Configure EAS Submit

Update `eas.json` with your credentials:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-email@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD123456"
      }
    }
  }
}
```

**Finding values:**
- `appleId`: Your Apple ID email
- `ascAppId`: App Store Connect > My Apps > Your App > App Information > Apple ID
- `appleTeamId`: Apple Developer account (top right corner)

## Building iOS App

### Cloud Build (Recommended)

```bash
npm run build:ios
```

Cloud builds are more reliable and don't require keychain access or local certificate setup.

**Requirements:**
- `.env.production` file with `EXPO_PUBLIC_*` variables
- EAS account configured

The build script will:
- Load environment variables
- Build the iOS app on Expo's servers
- Provide a download link when complete

### Local Build (Advanced)

If you need to build locally, you can use EAS directly:

```bash
# Load environment variables first
export $(grep -v '^#' .env.production | grep '^EXPO_PUBLIC_' | xargs)
eas build --local --platform ios --profile production
```

**Note:** Local builds require Xcode, Fastlane, and proper keychain/certificate setup.

## Submitting to App Store

### Option 1: Via EAS (Recommended)

```bash
eas submit --platform ios --profile production
```

### Option 2: Via Transporter App

1. Install Transporter from Mac App Store
2. Drag and drop your IPA file
3. Click "Deliver"

### Option 3: Via Xcode

1. Open Xcode > Window > Organizer
2. Select your archive
3. Click "Distribute App"

## Environment Variables

Create `.env.production` with:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=your_api_url  # Optional
```

## Version Management

Version is managed in `version.json`. To update:

```bash
npm run version:patch  # 1.0.0 → 1.0.1
npm run version:minor  # 1.0.0 → 1.1.0
npm run version:major  # 1.0.0 → 2.0.0
```

## Troubleshooting

### Fastlane not found
```bash
sudo gem install fastlane
# Verify: which fastlane
```

### Certificate import errors (local builds only)
- Use cloud builds instead: `npm run build:ios`
- For local builds, ensure Terminal has Full Disk Access
- Or unlock keychain: `security unlock-keychain ~/Library/Keychains/login.keychain-db`

### Code signing issues
- Open Xcode > Preferences > Accounts
- Add your Apple ID
- Download certificates and profiles

## Quick Reference

```bash
# Build iOS (cloud - recommended)
npm run build:ios

# Submit to App Store
eas submit --platform ios --profile production

# Check build status
eas build:list
```

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Apple Developer Portal](https://developer.apple.com)
- [App Store Connect](https://appstoreconnect.apple.com)
