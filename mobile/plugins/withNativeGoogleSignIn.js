/**
 * Expo config plugin for native Google Sign-In.
 *
 * - When EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME is set, use the upstream nitro plugin
 *   (adds the reversed iOS client ID URL scheme).
 * - Otherwise keep Android-first setup: no Firebase files / iOS scheme required.
 *   Still patch the iOS Podfile so compiling the optional native dependency does
 *   not fail static CocoaPods linking on App Check / GoogleUtilities pods.
 *
 * Native Google Sign-In is only invoked on Android development / store builds;
 * iOS continues to use browser OAuth for Google and native Apple Sign In.
 */

const {
  createRunOncePlugin,
  withPodfile,
} = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const GOOGLE_SIGN_IN_PODFILE_TAG = "sharedmoney-native-google-signin-pods";
const GOOGLE_SIGN_IN_PODFILE_PODS = `  pod 'AppCheckCore', :modular_headers => true
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true`;

function withGoogleSignInCocoaPods(config) {
  return withPodfile(config, (config) => {
    let results;
    try {
      results = mergeContents({
        tag: GOOGLE_SIGN_IN_PODFILE_TAG,
        src: config.modResults.contents,
        newSrc: GOOGLE_SIGN_IN_PODFILE_PODS,
        anchor: /use_native_modules/,
        offset: 0,
        comment: "#",
      });
    } catch (error) {
      if (error && error.code === "ERR_NO_MATCH") {
        throw new Error(
          "withNativeGoogleSignIn: could not patch ios/Podfile. " +
            "Ensure the Podfile contains use_native_modules! inside the app target.",
        );
      }
      throw error;
    }

    if (results.didMerge || results.didClear) {
      config.modResults.contents = results.contents;
    }
    return config;
  });
}

function withNativeGoogleSignIn(config) {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;

  if (iosUrlScheme) {
    const withNitroGoogleSignIn = require("react-native-nitro-google-signin/app.plugin.js");
    return withNitroGoogleSignIn(config, { iosUrlScheme });
  }

  return withGoogleSignInCocoaPods(config);
}

module.exports = createRunOncePlugin(
  withNativeGoogleSignIn,
  "sharedmoney-native-google-signin",
  "1.0.0",
);
