/**
 * Strip Associated Domains from the iOS entitlements plist unless explicitly
 * enabled. Needed while the App Store provisioning profile cannot be refreshed
 * non-interactively by EAS (profile lacks the capability).
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

function withStripAssociatedDomains(config) {
  if (process.env.EXPO_PUBLIC_ENABLE_ASSOCIATED_DOMAINS === 'true') {
    return config;
  }

  return withEntitlementsPlist(config, (cfg) => {
    if (cfg.modResults && 'com.apple.developer.associated-domains' in cfg.modResults) {
      delete cfg.modResults['com.apple.developer.associated-domains'];
    }
    return cfg;
  });
}

module.exports = withStripAssociatedDomains;
