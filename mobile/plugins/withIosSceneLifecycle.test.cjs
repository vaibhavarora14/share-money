const assert = require("node:assert/strict");
const test = require("node:test");
const {
  patchAppDelegateContents,
} = require("../plugins/withIosSceneLifecycle.js");

const SDK54_APP_DELEGATE = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
`;

test("patchAppDelegateContents removes classic window startup and adds SceneDelegate", () => {
  const patched = patchAppDelegateContents(SDK54_APP_DELEGATE);

  assert.doesNotMatch(patched, /window = UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.doesNotMatch(
    patched,
    /factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)/,
  );
  // Factory + dependency provider stay in didFinishLaunching.
  assert.match(patched, /ExpoReactNativeFactory\(delegate: delegate\)/);
  assert.match(patched, /RCTAppDependencyProvider\(\)/);
  assert.match(patched, /bindReactNativeFactory\(factory\)/);
  // Stash launchOptions for SceneDelegate cold-start Linking fallback.
  assert.match(patched, /var storedLaunchOptions:/);
  assert.match(patched, /storedLaunchOptions = launchOptions/);
  assert.match(patched, /@objc\(SceneDelegate\)/);
  assert.match(patched, /configurationForConnecting connectingSceneSession/);
  assert.match(patched, /UIWindow\(windowScene: windowScene\)/);
  assert.match(patched, /appDelegate\.window = nextWindow/);
  assert.match(patched, /appDelegate\.storedLaunchOptions/);
  assert.match(patched, /UIApplicationLaunchOptionsURLKey/);
  assert.match(patched, /openURLContexts URLContexts: Set<UIOpenURLContext>/);
  assert.match(patched, /RCTLinkingManager\.application/);
  assert.match(patched, /func scene\(_ scene: UIScene, continue userActivity: NSUserActivity\)/);
  // Existing AppDelegate Linking / Universal Links overrides stay in place.
  assert.match(patched, /\/\/ Linking API/);
  assert.match(patched, /\/\/ Universal Links/);
});

test("patchAppDelegateContents is idempotent", () => {
  const once = patchAppDelegateContents(SDK54_APP_DELEGATE);
  const twice = patchAppDelegateContents(once);
  assert.equal(twice, once);
});

test("patchAppDelegateContents fails loudly on unexpected AppDelegate shape", () => {
  assert.throws(
    () => patchAppDelegateContents("class AppDelegate {}\n"),
    /could not find Expo AppDelegate React Native startup block/,
  );
});
