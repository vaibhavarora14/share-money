/**
 * Layout constants for consistent styling across the app
 */

/**
 * Maximum width for web layout to ensure premium, centered experience
 * on larger screens while maintaining full-width on mobile devices
 */
export const WEB_MAX_WIDTH = 600;

/** Desktop-only notification panel; tablet and narrow web stay full-route. */
export const WEB_DESKTOP_BREAKPOINT = 1024;

export const isDesktopWebViewport = (platform: string, width: number) =>
  platform === "web" && width >= WEB_DESKTOP_BREAKPOINT;
