/**
 * Adopt UIKit scene lifecycle for iOS 27 / Xcode 27 SDK builds.
 *
 * Expo SDK 54 still generates the classic AppDelegate window startup. Apps
 * built with the iOS 27 SDK trap at launch with
 * `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` unless
 * Info.plist declares a full UIApplicationSceneManifest and a SceneDelegate
 * owns the UIWindow (Apple TN3187 / expo#46663 / #46664).
 *
 * Do NOT use expo-build-properties `ios.enableSceneSupport` here — that flag
 * only exists on Expo ≥57.0.23 and throws on SDK 54.
 *
 * Recipe (CNG / gitignored ios/):
 * 1. withInfoPlist — full UIApplicationSceneManifest with
 *    UISceneDelegateClassName = $(PRODUCT_MODULE_NAME).SceneDelegate
 * 2. withAppDelegate — keep factory + RCTAppDependencyProvider; stash
 *    launchOptions; remove UIWindow + startReactNative from didFinishLaunching
 * 3. Append SceneDelegate as a second class in AppDelegate.swift (avoids
 *    .pbxproj edits). Create UIWindow(windowScene:), start RN, mirror
 *    appDelegate.window, forward urlContexts / userActivities via
 *    RCTLinkingManager (+ AppDelegate overrides for Expo subscribers).
 *
 * Do not only conform ExpoAppDelegate to UIWindowSceneDelegate — that causes
 * blank screens (expo#47570). Production Release is what App Review runs;
 * expo-dev-launcher may still need a separate patch for local dev clients.
 *
 * Remove once upgraded to Expo SDK 58+ (scene by default) or SDK 57.0.23+
 * with enableSceneSupport.
 */

const PLUGIN_NAME = "sharedmoney-ios-scene-lifecycle";
const PLUGIN_VERSION = "1.1.1";

/**
 * Lazy-require @expo/config-plugins.
 *
 * `eas-build-pre-install` runs `test:ios-scene-lifecycle` (and may evaluate
 * this module) before `npm install`, so a top-level require fails. Pure
 * helpers like `patchAppDelegateContents` must stay loadable without it.
 * Documented exception to the no-inline-imports rule.
 * @returns {typeof import("@expo/config-plugins")}
 */
function getExpoConfigPlugins() {
  return require("@expo/config-plugins");
}

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
// Separate SceneDelegate class — do not put UIWindowSceneDelegate on
// ExpoAppDelegate alone (blank screen / expo#47570).
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
    // UIApplication.shared.delegate?.window (e.g. status-bar / system-ui).
    appDelegate.window = nextWindow

    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    // Prefer scene connectionOptions (where cold-start URLs live under the
    // scene life cycle); fall back to launchOptions stashed in AppDelegate.
    let launchOptions =
      Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      ) ?? appDelegate.storedLaunchOptions

    factory.startReactNative(
      withModuleName: "main",
      in: nextWindow,
      launchOptions: launchOptions
    )

    // Cold-start deep / universal links: also notify Linking listeners.
    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    for userActivity in connectionOptions.userActivities {
      self.scene(scene, continue: userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    let application = UIApplication.shared
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
      // AppDelegate openURL already forwards to RCTLinkingManager + Expo
      // subscribers — call once to avoid duplicate Linking events.
      _ = appDelegate.application(application, open: urlContext.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    // AppDelegate continue already includes RCTLinkingManager.
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  /// Rebuild launch-option keys that React Native / expo-linking still read for
  /// \`Linking.getInitialURL()\`. Scene cold-starts put URLs in connectionOptions,
  /// not the app-delegate launchOptions dictionary.
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
    // Stash launchOptions for SceneDelegate; window + startReactNative move
    // there under the UIScene life cycle (required by the iOS 27 SDK).
    storedLaunchOptions = launchOptions
#endif`;

const STORED_LAUNCH_OPTIONS_PROPERTY = `  /// Launch options captured in didFinishLaunching for SceneDelegate to pass
  /// into startReactNative (cold-start Linking.getInitialURL fallback).
  var storedLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?
`;

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

  // Keep factory + RCTAppDependencyProvider; add stash property next to window.
  if (!nextContents.includes("var storedLaunchOptions:")) {
    const windowProperty = "  var window: UIWindow?\n";
    if (!nextContents.includes(windowProperty)) {
      throw new Error(
        `${PLUGIN_NAME}: could not find AppDelegate window property to insert storedLaunchOptions.`,
      );
    }
    nextContents = nextContents.replace(
      windowProperty,
      `${windowProperty}\n${STORED_LAUNCH_OPTIONS_PROPERTY}`,
    );
  }

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
  const { withInfoPlist } = getExpoConfigPlugins();
  return withInfoPlist(config, (cfg) => {
    // Full manifest required — empty UISceneConfigurations still traps on iOS 27.
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
  const { withAppDelegate } = getExpoConfigPlugins();
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

/** Cached createRunOncePlugin wrapper — built on first invoke after install. */
let runOncePlugin;

function withIosSceneLifecyclePlugin(config) {
  if (!runOncePlugin) {
    const { createRunOncePlugin } = getExpoConfigPlugins();
    runOncePlugin = createRunOncePlugin(
      withIosSceneLifecycle,
      PLUGIN_NAME,
      PLUGIN_VERSION,
    );
  }
  return runOncePlugin(config);
}

module.exports = withIosSceneLifecyclePlugin;
module.exports.patchAppDelegateContents = patchAppDelegateContents;
module.exports.STARTUP_BLOCK_PATTERN = STARTUP_BLOCK_PATTERN;
module.exports.SCENE_DELEGATE_CLASS = SCENE_DELEGATE_CLASS;
module.exports.PLUGIN_VERSION = PLUGIN_VERSION;
