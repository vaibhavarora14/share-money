/**
 * Dynamic Expo configuration that supports both Expo Go and Development Builds
 * 
 * To use Expo Go: Just run `expo start` and scan the QR code
 * To use Development Build: Run `npm run build:android` or `npm run build:ios` first
 */

const fs = require('fs');
const path = require('path');

// Read version from version.json
const versionPath = path.join(__dirname, 'version.json');
let versionConfig = { version: '1.0.0', buildNumber: 1 };

try {
  const versionFile = fs.readFileSync(versionPath, 'utf8');
  versionConfig = JSON.parse(versionFile);
  
  // Validate structure
  if (!versionConfig.version || typeof versionConfig.version !== 'string') {
    throw new Error('Invalid version.json: missing or invalid "version" field');
  }
  if (typeof versionConfig.buildNumber !== 'number' || versionConfig.buildNumber < 1) {
    throw new Error('Invalid version.json: missing or invalid "buildNumber" field (must be >= 1)');
  }
  
  // Validate version format (basic check)
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(versionConfig.version)) {
    throw new Error(`Invalid version format: "${versionConfig.version}". Expected MAJOR.MINOR.PATCH`);
  }
} catch (error) {
  // In production builds, fail hard to catch configuration issues early
  const isProduction = process.env.NODE_ENV === 'production' || process.env.EAS_BUILD;
  
  if (isProduction) {
    console.error('ERROR: Could not read or validate version.json:', error.message);
    console.error('This is a production build - version.json is required.');
    process.exit(1);
  } else {
    console.warn('Warning: Could not read version.json, using defaults:', error.message);
    console.warn('This is acceptable in development, but version.json is required for production builds.');
  }
}

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
      version: versionConfig.version,
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
        scheme: "com.sharemoney.app",
        buildNumber: versionConfig.buildNumber.toString()
      },
      android: {
        package: "com.sharemoney.app",
        scheme: "com.sharemoney.app",
        versionCode: versionConfig.buildNumber,
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

