import { MD3LightTheme, MD3DarkTheme, configureFonts } from "react-native-paper";
import { Platform } from "react-native";

// Google Brand Colors
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_RED = "#ea4335";
const GOOGLE_YELLOW = "#fbbc04";
const GOOGLE_GREEN = "#34a853";

// Light Theme Colors
const lightColors = {
  ...MD3LightTheme.colors,
  primary: GOOGLE_BLUE,
  onPrimary: "#ffffff",
  primaryContainer: "#e8f0fe",
  onPrimaryContainer: "#1967d2",
  secondary: GOOGLE_BLUE, // Using Blue as secondary for a cohesive look
  onSecondary: "#ffffff",
  secondaryContainer: "#d2e3fc",
  onSecondaryContainer: "#174ea6",
  tertiary: GOOGLE_GREEN,
  onTertiary: "#ffffff",
  tertiaryContainer: "#ceead6",
  onTertiaryContainer: "#0d652d",
  error: GOOGLE_RED,
  onError: "#ffffff",
  errorContainer: "#fad2cf",
  onErrorContainer: "#a50e0e",
  background: "#ffffff",
  onBackground: "#202124",
  surface: "#ffffff",
  onSurface: "#202124",
  surfaceVariant: "#f1f3f4",
  onSurfaceVariant: "#5f6368",
  outline: "#dadce0",
  outlineVariant: "#e8eaed",
  elevation: {
    level0: "transparent",
    level1: "#f8f9fa",
    level2: "#f1f3f4",
    level3: "#e8eaed",
    level4: "#dadce0",
    level5: "#bdc1c6",
  },
};

// Dark Theme Colors
const darkColors = {
  ...MD3DarkTheme.colors,
  primary: "#8ab4f8",
  onPrimary: "#202124",
  primaryContainer: "#174ea6",
  onPrimaryContainer: "#e8f0fe",
  secondary: "#8ab4f8",
  onSecondary: "#202124",
  secondaryContainer: "#174ea6",
  onSecondaryContainer: "#d2e3fc",
  tertiary: "#81c995",
  onTertiary: "#202124",
  tertiaryContainer: "#0d652d",
  onTertiaryContainer: "#ceead6",
  error: "#f28b82",
  onError: "#202124",
  errorContainer: "#a50e0e",
  onErrorContainer: "#fad2cf",
  background: "#202124",
  onBackground: "#e8eaed",
  surface: "#202124",
  onSurface: "#e8eaed",
  surfaceVariant: "#303134",
  onSurfaceVariant: "#bdc1c6",
  outline: "#5f6368",
  outlineVariant: "#3c4043",
  elevation: {
    level0: "transparent",
    level1: "#292a2d",
    level2: "#2d2e31",
    level3: "#303134",
    level4: "#323336",
    level5: "#35363a",
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
