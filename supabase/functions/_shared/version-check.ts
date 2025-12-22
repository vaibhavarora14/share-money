/**
 * Version Check Middleware
 * 
 * Validates the X-App-Version header against minimum supported version.
 * Returns HTTP 426 (Upgrade Required) for outdated apps.
 */

import { createErrorResponse } from './error-handler.ts';
import { VERSION_CONFIG } from './version-config.ts';

interface VersionCheckResult {
  valid: boolean;
  currentVersion: string | null;
  minVersion: string;
}

/**
 * Compare two semver versions
 * @returns negative if a < b, 0 if a == b, positive if a > b
 */
function semverCompare(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    if (partA !== partB) {
      return partA - partB;
    }
  }
  return 0;
}

/**
 * Check if the app version meets minimum requirements
 * @param req - The incoming request
 * @returns VersionCheckResult with validity status
 */
export function checkAppVersion(req: Request): VersionCheckResult {
  const appVersion = req.headers.get('X-App-Version');
  const minVersion = VERSION_CONFIG.MIN_SUPPORTED_VERSION;

  // If no version header, allow the request (backward compatibility)
  // Old apps don't send this header, so we can't block them
  if (!appVersion) {
    return { valid: true, currentVersion: null, minVersion };
  }

  // Validate version format (basic check)
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(appVersion)) {
    // Invalid format - allow but log
    console.warn(`Invalid X-App-Version format: ${appVersion}`);
    return { valid: true, currentVersion: appVersion, minVersion };
  }

  // Compare versions
  const isValid = semverCompare(appVersion, minVersion) >= 0;
  return { valid: isValid, currentVersion: appVersion, minVersion };
}

/**
 * Create an HTTP 426 response for outdated apps
 */
export function createUpgradeRequiredResponse(): Response {
  const details = JSON.stringify({
    minVersion: VERSION_CONFIG.MIN_SUPPORTED_VERSION,
    latestVersion: VERSION_CONFIG.LATEST_VERSION,
    storeUrlIos: VERSION_CONFIG.STORE_URL_IOS,
    storeUrlAndroid: VERSION_CONFIG.STORE_URL_ANDROID,
  });
  
  return createErrorResponse(
    426,
    VERSION_CONFIG.UPDATE_MESSAGE,
    'UPGRADE_REQUIRED',
    details
  );
}

/**
 * Middleware helper - check version and return error response if needed
 * Returns null if version is valid, or a Response if upgrade is required
 */
export function requireMinVersion(req: Request): Response | null {
  const result = checkAppVersion(req);
  if (!result.valid) {
    console.log(`Rejecting request from outdated app: ${result.currentVersion} < ${result.minVersion}`);
    return createUpgradeRequiredResponse();
  }
  return null;
}
