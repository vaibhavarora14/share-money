import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ColorSchemeName } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemePreferenceContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

const THEME_PREFERENCE_STORAGE_KEY = "owewho.themePreference";

const ThemePreferenceContext =
  createContext<ThemePreferenceContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
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
    useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    const loadThemePreference = async () => {
      const savedPreference = await AsyncStorage.getItem(
        THEME_PREFERENCE_STORAGE_KEY
      );

      if (!cancelled && isThemePreference(savedPreference)) {
        setThemePreferenceState(savedPreference);
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
