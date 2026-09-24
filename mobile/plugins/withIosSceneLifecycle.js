/**
 * Adopt UIKit scene lifecycle for iOS 27 / Xcode 27 SDK builds.
 *
 * Expo SDK 54 still generates the classic AppDelegate window startup. Apps
 * built with the iOS 27 SDK trap at launch with
 * `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` unless
 * Info.plist declares UIApplicationSceneManifest and a SceneDelegate owns the
 * UIWindow (Apple TN3187 / expo#46664).
 *
 * This plugin:
 * 1. Adds UIApplicationSceneManifest to Info.plist
 * 2. Moves window + startReactNative into SceneDelegate
 * 3. Rebuilds launchOptions from scene connectionOptions so
 *    Linking.getInitialURL() still works on cold-start deep/universal links
 * 4. Forwards openURLContexts / continue userActivity to AppDelegate Linking
 *
 * Remove once the project upgrades to an Expo SDK that generates scene support
 * by default (SDK 58+) or opt-in enableSceneSupport (SDK 57.0.23+).
 */

const {
  createRunOncePlugin,
  withAppDelegate,
  withInfoPlist,
} = require("@expo/config-plugins");

const PLUGIN_NAME = "sharedmoney-ios-scene-lifecycle";
const PLUGIN_VERSION = "1.0.0";

const SCENE_CONFIGURATION_METHOD = `
  // UIScene configuration (iOS 27 SDK requires scene lifecycle — TN3187)
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
`;

const SCENE_DELEGATE_CLASS = `
// Scene-owned window + RN startup. Required by the iOS 27 SDK (TN3187).
// Deep/universal links arrive via connectionOptions / scene URL callbacks
// instead of AppDelegate launch options — rebuild launchOptions and forward
// open/continue so expo-linking and RCTLinkingManager keep working.
@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let nextWindow = UIWindow(windowScene: windowScene)
    window = nextWindow
    // Keep AppDelegate.window in sync for code that still reads
    // UIApplication.shared.delegate?.window (e.g. status-bar / system-ui helpers).
    appDelegate.window = nextWindow

    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }

    factory.startReactNative(
      withModuleName: "main",
      in: nextWindow,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    for userActivity in connectionOptions.userActivities {
      _ = appDelegate.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in }
      )
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    for urlContext in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: urlContext.options.openInPlace,
      ]
      if let sourceApplication = urlContext.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = urlContext.options.annotation {
        options[.annotation] = annotation
      }
      _ = appDelegate.application(
        UIApplication.shared,
        open: urlContext.url,
        options: options
      )
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  /// Rebuild launch-option keys that React Native / expo-linking still read for
  /// \`Linking.getInitialURL()\`. Scene cold-starts no longer put URLs in the
  /// app-delegate launchOptions dictionary.
  private static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      let urlKey = UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")
      launchOptions[urlKey] = url
    }
    if let userActivity {
      let userActivityDictionaryKey = UIApplication.LaunchOptionsKey(
        rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey"
      )
      launchOptions[userActivityDictionaryKey] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }
}
`;

const STARTUP_BLOCK_PATTERN =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif/;

const STARTUP_REPLACEMENT = `#if os(iOS) || os(tvOS)
    // Window + React Native are started by SceneDelegate under the UIScene
    // life cycle (required by the iOS 27 SDK — see withIosSceneLifecycle).
#endif`;

/**
 * Patch generated AppDelegate.swift contents for scene lifecycle.
 * Exported for unit tests.
 * @param {string} contents
 * @returns {string}
 */
function patchAppDelegateContents(contents) {
  if (contents.includes("@objc(SceneDelegate)")) {
    return contents;
  }

  if (!STARTUP_BLOCK_PATTERN.test(contents)) {
    throw new Error(
      `${PLUGIN_NAME}: could not find Expo AppDelegate React Native startup block. ` +
        "Expected window = UIWindow(...) + factory.startReactNative(...) under #if os(iOS).",
    );
  }

  let nextContents = contents.replace(STARTUP_BLOCK_PATTERN, STARTUP_REPLACEMENT);

  if (!nextContents.includes("configurationForConnecting connectingSceneSession")) {
    const linkingMarker = "\n  // Linking API";
    if (!nextContents.includes(linkingMarker)) {
      throw new Error(
        `${PLUGIN_NAME}: could not find AppDelegate "// Linking API" marker to insert scene configuration.`,
      );
    }
    nextContents = nextContents.replace(
      linkingMarker,
      `\n${SCENE_CONFIGURATION_METHOD}\n  // Linking API`,
    );
  }

  const reactNativeDelegateMarker = "\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate";
  if (!nextContents.includes(reactNativeDelegateMarker)) {
    throw new Error(
      `${PLUGIN_NAME}: could not find ReactNativeDelegate class to append SceneDelegate.`,
    );
  }

  return nextContents.replace(
    reactNativeDelegateMarker,
    `\n${SCENE_DELEGATE_CLASS}${reactNativeDelegateMarker}`,
  );
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        `${PLUGIN_NAME}: Swift AppDelegate required (got ${cfg.modResults.language}).`,
      );
    }
    cfg.modResults.contents = patchAppDelegateContents(cfg.modResults.contents);
    return cfg;
  });
}

function withIosSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
}

module.exports = createRunOncePlugin(withIosSceneLifecycle, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.patchAppDelegateContents = patchAppDelegateContents;
module.exports.STARTUP_BLOCK_PATTERN = STARTUP_BLOCK_PATTERN;
module.exports.SCENE_DELEGATE_CLASS = SCENE_DELEGATE_CLASS;
