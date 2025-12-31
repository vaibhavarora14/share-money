/**
 * Theme Context
 * Manages dark mode state - defaults to system preference
 */
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    // Default to system preference, but respect user's manual choice if stored
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("theme");
      // If user has manually set a theme, respect it
      if (stored === "dark" || stored === "light") {
        return stored === "dark";
      }
      // Otherwise, follow system preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    // Apply theme to document
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Listen to system theme changes when user hasn't manually set a preference
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = sessionStorage.getItem("theme");
    // Only listen to system changes if user hasn't manually set a theme
    if (stored !== "dark" && stored !== "light") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      }
      // Fallback for older browsers
      else if (mediaQuery.addListener) {
        const legacyHandler = () => setIsDark(mediaQuery.matches);
        mediaQuery.addListener(legacyHandler);
        return () => mediaQuery.removeListener(legacyHandler);
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    // Save user's manual choice for current session only
    sessionStorage.setItem("theme", newTheme ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
