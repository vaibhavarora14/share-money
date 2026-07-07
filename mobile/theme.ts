import { MD3LightTheme, MD3DarkTheme, configureFonts } from "react-native-paper";
import { Platform } from "react-native";

/**
 * ShareMoney brand palette.
 *
 * Derived from the app artwork (logo / splash): an indigo-to-violet gradient
 * with a teal accent in the mark. Roles:
 * - primary   → brand indigo (buttons, links, active states)
 * - secondary → violet (selection pills, banners)
 * - tertiary  → teal (positive amounts, "you are owed")
 * - error     → red ("you owe", destructive actions)
 */

const lightColors = {
  ...MD3LightTheme.colors,
  primary: "#4f46e5",
  onPrimary: "#ffffff",
  primaryContainer: "#e0e7ff",
  onPrimaryContainer: "#3730a3",
  secondary: "#7c3aed",
  onSecondary: "#ffffff",
  secondaryContainer: "#ede9fe",
  onSecondaryContainer: "#5b21b6",
  tertiary: "#0d9488",
  onTertiary: "#ffffff",
  tertiaryContainer: "#ccfbf1",
  onTertiaryContainer: "#115e59",
  error: "#dc2626",
  onError: "#ffffff",
  errorContainer: "#fee2e2",
  onErrorContainer: "#991b1b",
  // Soft indigo-tinted canvas so white surface cards read with depth
  background: "#f7f7fd",
  onBackground: "#1b1b2f",
  surface: "#ffffff",
  onSurface: "#1b1b2f",
  surfaceVariant: "#e9e9f6",
  onSurfaceVariant: "#55556d",
  outline: "#cfcfe3",
  outlineVariant: "#e4e4f1",
  inverseSurface: "#303048",
  inverseOnSurface: "#f2f1fa",
  inversePrimary: "#a5b4fc",
  surfaceTint: "#4f46e5",
  surfaceDisabled: "rgba(27, 27, 47, 0.12)",
  onSurfaceDisabled: "rgba(27, 27, 47, 0.38)",
  backdrop: "rgba(27, 27, 47, 0.4)",
  elevation: {
    level0: "transparent",
    level1: "#f6f6fc",
    level2: "#f0f0f9",
    level3: "#e9e9f6",
    level4: "#e4e4f3",
    level5: "#dedeef",
  },
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: "#a5b4fc",
  onPrimary: "#1e1b4b",
  primaryContainer: "#4338ca",
  onPrimaryContainer: "#e0e7ff",
  secondary: "#c4b5fd",
  onSecondary: "#2e1065",
  secondaryContainer: "#5b21b6",
  onSecondaryContainer: "#ede9fe",
  tertiary: "#5eead4",
  onTertiary: "#042f2e",
  tertiaryContainer: "#115e59",
  onTertiaryContainer: "#ccfbf1",
  error: "#f87171",
  onError: "#450a0a",
  errorContainer: "#7f1d1d",
  onErrorContainer: "#fecaca",
  // Indigo-tinted darks instead of neutral grey
  background: "#121220",
  onBackground: "#e6e5f2",
  surface: "#1a1a2c",
  onSurface: "#e6e5f2",
  surfaceVariant: "#2a2a40",
  onSurfaceVariant: "#b3b2cc",
  outline: "#4d4d68",
  outlineVariant: "#34344e",
  inverseSurface: "#e6e5f2",
  inverseOnSurface: "#1b1b2f",
  inversePrimary: "#4f46e5",
  surfaceTint: "#a5b4fc",
  surfaceDisabled: "rgba(230, 229, 242, 0.12)",
  onSurfaceDisabled: "rgba(230, 229, 242, 0.38)",
  backdrop: "rgba(0, 0, 0, 0.5)",
  elevation: {
    level0: "transparent",
    level1: "#1e1e31",
    level2: "#232338",
    level3: "#28283f",
    level4: "#2a2a43",
    level5: "#2f2f4a",
  },
};

const fontConfig = {
  fontFamily: Platform.select({
    web: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
    ios: "System",
    default: "sans-serif",
  }),
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: lightColors,
  fonts: configureFonts({config: fontConfig}),
  roundness: 16, // More rounded corners like modern Google apps
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: darkColors,
  fonts: configureFonts({config: fontConfig}),
  roundness: 16,
};
