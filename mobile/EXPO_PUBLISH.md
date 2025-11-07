# Publishing to Expo

## ✅ Setup Complete!

The app has been configured and published to Expo. Here's what's been done:

- ✅ EAS project linked: `afddb7db-3d7d-46da-a1b5-0d6e4b4374ce`
- ✅ App published to Expo organization: `share-money`
- ✅ OTA updates configured and published
- ✅ Android build in progress
- ✅ iOS configuration ready

## OTA Updates (EAS Update)

To publish updates to the live app:

```bash
cd mobile
eas update --branch production --message "Your update message"
```

This pushes Over-The-Air updates that users receive automatically.

## Production Builds (EAS Build)

For production builds (standalone apps):

**✅ Already configured!** EAS is set up and ready.

To build for production:
   ```bash
   # iOS
   eas build --platform ios
   
   # Android
   eas build --platform android
   
   # Both
   eas build --platform all
   ```

## Important Notes

- **API URL**: ✅ Configured in `App.tsx` - uses production URL for non-dev builds
- **Environment Variables**: 
  - Must use the `EXPO_PUBLIC_` prefix to be accessible in the app (e.g., `EXPO_PUBLIC_SUPABASE_URL`)
  - Can be set in EAS dashboard or via `eas secret:create`
  - For local development, create a `.env` file in the `mobile/` directory
- **Updates**: Use `eas update` to push OTA updates (already published initial version)

## Current Configuration

- **App Name**: ShareMoney
- **Slug**: share-money
- **Owner**: share-money
- **Version**: 1.0.0
- **Android Package**: com.sharemoney.app
- **iOS Bundle ID**: com.sharemoney.app
- **EAS Project ID**: afddb7db-3d7d-46da-a1b5-0d6e4b4374ce

## View Your App

- **Dashboard**: https://expo.dev/accounts/share-money/projects/share-money
- **Updates**: https://expo.dev/accounts/share-money/projects/share-money/updates
- **Builds**: https://expo.dev/accounts/share-money/projects/share-money/builds

