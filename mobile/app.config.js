/**
 * Dynamic Expo configuration that supports both Expo Go and Development Builds
 * 
 * To use Expo Go: Just run `expo start` and scan the QR code
 * To use Development Build: Run `npm run build:android` or `npm run build:ios` first
 */

const fs = require('fs');
const path = require('path');
const { resolveAndroidPushConfig } = require('./config/androidPushConfig.cjs');

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
  const androidPushConfig = resolveAndroidPushConfig({
    env: process.env,
    projectRoot: __dirname,
  });

  // Only include expo-dev-client in development builds. EAS sets
  // EAS_BUILD_PROFILE for production too, so check the profile value.
  const isDevelopmentBuild =
    process.env.EAS_BUILD_PROFILE === 'development' ||
    process.env.EXPO_PUBLIC_USE_DEV_CLIENT === 'true';

  // Hostname for Universal Links (iOS) / App Links (Android), used by the
  // group invite-link feature. When unset, only the custom scheme is used.
  let appUrlHostname = null;
  let appLinkPathPrefix = "/join";
  try {
    if (process.env.EXPO_PUBLIC_APP_URL) {
      const appUrl = new URL(process.env.EXPO_PUBLIC_APP_URL);
      appUrlHostname = appUrl.hostname;
      const appPath = appUrl.pathname.replace(/\/+$/, "");
      appLinkPathPrefix = `${appPath === "/" ? "" : appPath}/join`;
    }
  } catch (e) {
    console.warn('Warning: EXPO_PUBLIC_APP_URL is invalid; Universal/App Links disabled');
  }

  const webBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  const webExportBaseUrl =
    webBaseUrl && !/^https?:\/\//i.test(webBaseUrl) ? webBaseUrl : null;
  const appLinkHosts = Array.from(
    new Set([appUrlHostname, "owewho.com"].filter(Boolean))
  );
  const appSchemes = ["sharedmoney", "owewho"];

  return {
    ...config,
    expo: {
      ...config.expo,
      name: "SharedMoney",
      slug: "share-money",
      owner: "varora1406",
      scheme: appSchemes,
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
        scheme: appSchemes,
        buildNumber: versionConfig.buildNumber.toString(),
        usesAppleSignIn: true,
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
        appLinkHosts.length > 0
          ? { associatedDomains: appLinkHosts.map((host) => `applinks:${host}`) }
          : {})
      },
      android: {
        package: "com.vaibhavarora.sharemoney",
        ...androidPushConfig,
        scheme: appSchemes,
        versionCode: versionConfig.buildNumber,
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#F7F9FC"
        },
        edgeToEdgeEnabled: true,
        // App Links for invite links; requires assetlinks.json hosted at
        // https://<host>/.well-known/assetlinks.json
        intentFilters: appLinkHosts.length > 0
          ? [
              {
                action: "VIEW",
                autoVerify: true,
                data: appLinkHosts.map((host) => ({
                  scheme: "https",
                  host,
                  pathPrefix: appLinkPathPrefix
                })),
                category: ["BROWSABLE", "DEFAULT"]
              }
            ]
          : []
      },
      web: {
        favicon: "./assets/favicon.png",
        bundler: "metro",
        output: "single"
      },
      ...(webExportBaseUrl
        ? {
            experiments: {
              ...(config.expo?.experiments || {}),
              baseUrl: webExportBaseUrl
            }
          }
        : {}),
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
        "expo-apple-authentication",
        "expo-font",
        "expo-notifications",
        "expo-web-browser",
        // Only include expo-dev-client plugin for development builds
        ...(isDevelopmentBuild ? ["expo-dev-client"] : [])
      ]
    }
  };
};
