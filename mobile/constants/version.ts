/**
 * Version Constants
 * 
 * Exports the app version from version.json for use in API headers
 * and version display.
 */

// Import version data directly - this is bundled at build time
const versionData = require('../version.json');

export const APP_VERSION: string = versionData.version;
export const BUILD_NUMBER: number = versionData.buildNumber;

/**
 * Get the full version string including build number
 * e.g., "1.5.0 (15)"
 */
export function getFullVersionString(): string {
  return `${APP_VERSION} (${BUILD_NUMBER})`;
}
