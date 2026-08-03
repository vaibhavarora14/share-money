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
  // Only include expo-dev-client in development builds. EAS sets
  // EAS_BUILD_PROFILE for production too, so check the profile value.
  const isDevelopmentBuild =
    process.env.EAS_BUILD_PROFILE === 'development' ||
    process.env.EXPO_PUBLIC_USE_DEV_CLIENT === 'true';

  // Hostname for Universal Links (iOS) / App Links (Android), used by the
  // group invite-link feature. When unset, only the custom scheme is used.
  let appUrlHostname = null;
  try {
    if (process.env.EXPO_PUBLIC_APP_URL) {
      appUrlHostname = new URL(process.env.EXPO_PUBLIC_APP_URL).hostname;
    }
  } catch (e) {
    console.warn('Warning: EXPO_PUBLIC_APP_URL is invalid; Universal/App Links disabled');
  }

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
        backgroundColor: "#F7F9FC"
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.vaibhavarora.sharemoney",
        scheme: "com.vaibhavarora.sharemoney",
        buildNumber: versionConfig.buildNumber.toString(),
        // Avoid App Store Connect manual encryption questionnaire prompts.
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false
        },
        // Universal Links require Associated Domains on the App Store
        // provisioning profile. EAS cannot refresh that profile
        // non-interactively right now, so only enable when explicitly opted in.
        // IMPORTANT: omit the key entirely when disabled — an empty array can
        // still cause prebuild to request the entitlement.
        ...(process.env.EXPO_PUBLIC_ENABLE_ASSOCIATED_DOMAINS === 'true' &&
        appUrlHostname
          ? { associatedDomains: [`applinks:${appUrlHostname}`] }
          : {})
      },
      android: {
        package: "com.vaibhavarora.sharemoney",
        scheme: "com.vaibhavarora.sharemoney",
        versionCode: versionConfig.buildNumber,
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#F7F9FC"
        },
        edgeToEdgeEnabled: true,
        // App Links for invite links; requires assetlinks.json hosted at
        // https://<host>/.well-known/assetlinks.json
        intentFilters: appUrlHostname
          ? [
              {
                action: "VIEW",
                autoVerify: true,
                data: [
                  { scheme: "https", host: appUrlHostname, pathPrefix: "/join" }
                ],
                category: ["BROWSABLE", "DEFAULT"]
              }
            ]
          : []
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
        './plugins/withStripAssociatedDomains',
        [
          "expo-build-properties",
          {
            "android": {
              "enableMinifyInReleaseBuilds": true,
              "enableShrinkResourcesInReleaseBuilds": true
            }
          }
        ],  
        [
          "expo-asset",
          {
            "assets": ["./assets"]
          },
        ],
        "expo-font",
        "expo-web-browser",
        // Only include expo-dev-client plugin for development builds
        ...(isDevelopmentBuild ? ["expo-dev-client"] : [])
      ]
    }
  };
};
