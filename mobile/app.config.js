/**
 * Dynamic Expo configuration that supports both Expo Go and Development Builds
 * 
 * To use Expo Go: Just run `expo start` and scan the QR code
 * To use Development Build: Run `npm run build:android` or `npm run build:ios` first
 */

module.exports = ({ config }) => {
  // Check if we're building for development builds (via EAS or local)
  // EAS_BUILD_PROFILE is automatically set by EAS Build
  // EXPO_PUBLIC_USE_DEV_CLIENT can be set manually for local builds
  const isDevelopmentBuild = !!process.env.EAS_BUILD_PROFILE || 
                             process.env.EXPO_PUBLIC_USE_DEV_CLIENT === 'true';

  return {
    ...config,
    expo: {
      ...config.expo,
      name: "ShareMoney",
      slug: "share-money",
      owner: "share-money",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic", // Respects system dark/light mode preference
      // Enable new architecture - supported in both Expo Go and development builds
      newArchEnabled: true,
      splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#14B8A6"
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.sharemoney.app",
        scheme: "com.sharemoney.app"
      },
      android: {
        package: "com.sharemoney.app",
        scheme: "com.sharemoney.app",
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#14B8A6"
        },
        edgeToEdgeEnabled: true
      },
      web: {
        favicon: "./assets/favicon.png"
      },
      extra: {
        eas: {
          projectId: "afddb7db-3d7d-46da-a1b5-0d6e4b4374ce"
        }
      },
      runtimeVersion: {
        policy: "appVersion"
      },
      updates: {
        url: "https://u.expo.dev/afddb7db-3d7d-46da-a1b5-0d6e4b4374ce",
        enabled: true,
        checkAutomatically: "ON_ERROR_RECOVERY",
        fallbackToCacheTimeout: 0
      },
      plugins: [
        [
          "expo-asset",
          {
            "assets": ["./assets"]
          }
        ],
        "expo-font",
        "expo-web-browser",
        // Only include expo-dev-client plugin for development builds
        ...(isDevelopmentBuild ? ["expo-dev-client"] : [])
      ]
    }
  };
};

