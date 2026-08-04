import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ColorSchemeName, Platform } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemePreferenceContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

const THEME_PREFERENCE_STORAGE_KEY = "sharedmoney.themePreference";
const LEGACY_THEME_PREFERENCE_STORAGE_KEY = "owewho.themePreference";
const LANDING_THEME_STORAGE_KEY = "theme";

const ThemePreferenceContext =
  createContext<ThemePreferenceContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function getLandingThemePreference(): ThemePreference | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  const landingTheme = window.sessionStorage.getItem(LANDING_THEME_STORAGE_KEY);
  return landingTheme === "light" || landingTheme === "dark"
    ? landingTheme
    : null;
}

function syncLandingThemePreference(preference: ThemePreference) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return;
  }

  if (preference === "system") {
    window.sessionStorage.removeItem(LANDING_THEME_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(LANDING_THEME_STORAGE_KEY, preference);
}

function resolveTheme(
  preference: ThemePreference,
  systemColorScheme: ColorSchemeName
): ResolvedTheme {
  if (preference === "system") {
    return systemColorScheme === "dark" ? "dark" : "light";
  }

  return preference;
}

interface ThemePreferenceProviderProps {
  children: React.ReactNode;
  systemColorScheme: ColorSchemeName;
}

export function ThemePreferenceProvider({
  children,
  systemColorScheme,
}: ThemePreferenceProviderProps) {
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(() => getLandingThemePreference() ?? "system");

  useEffect(() => {
    let cancelled = false;

    const loadThemePreference = async () => {
      const savedPreference =
        getLandingThemePreference() ??
        (await AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)) ??
        (await AsyncStorage.getItem(LEGACY_THEME_PREFERENCE_STORAGE_KEY)) ??
        null;

      if (!cancelled && isThemePreference(savedPreference)) {
        setThemePreferenceState(savedPreference);
        await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, savedPreference);
        syncLandingThemePreference(savedPreference);
      }
    };

    void loadThemePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePreference = useCallback(
    async (preference: ThemePreference) => {
      setThemePreferenceState(preference);
      syncLandingThemePreference(preference);
      await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    },
    []
  );

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme: resolveTheme(themePreference, systemColorScheme),
      setThemePreference,
    }),
    [setThemePreference, systemColorScheme, themePreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);

  if (!context) {
    throw new Error(
      "useThemePreference must be used within ThemePreferenceProvider"
    );
  }

  return context;
}
