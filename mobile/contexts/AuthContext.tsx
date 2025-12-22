import * as Sentry from "@sentry/react-native";
import { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { AUTH_TIMEOUTS } from "../constants/auth";
import { supabase } from "../supabase";
import { log, logError } from "../utils/logger";

// Complete the auth session when browser closes
WebBrowser.maybeCompleteAuthSession();

/**
 * Maps Supabase auth errors to user-friendly error messages
 * @param error - The error from Supabase auth
 * @param operation - The operation being performed ('signIn' | 'signUp')
 * @returns A user-friendly error message, or the original error if no mapping exists
 */
function mapAuthError(
  error: Error & { status?: number; code?: string },
  operation: "signIn" | "signUp"
): Error {
  // Sign in specific errors
  if (operation === "signIn") {
    // Invalid credentials
    if (
      error.status === 400 &&
      (error.message.includes("Invalid login credentials") ||
        error.message.includes("invalid_credentials") ||
        error.code === "invalid_credentials")
    ) {
      return new Error(
        "Invalid email or password. Please check your credentials and try again."
      );
    }

    // Rate limit
    if (
      error.status === 429 ||
      error.message.includes("rate limit") ||
      error.message.includes("429")
    ) {
      return new Error(
        "Too many sign-in attempts. Please wait a moment and try again."
      );
    }

    // Email confirmation required
    if (error.message.includes("email") && error.message.includes("confirm")) {
      return new Error(
        "Please check your email and confirm your account before signing in."
      );
    }
  }

  // Sign up specific errors
  if (operation === "signUp") {
    // User already exists
    if (
      error.status === 400 &&
      (error.message.includes("User already registered") ||
        error.message.includes("already registered") ||
        error.message.includes("email address is already registered") ||
        error.code === "user_already_registered")
    ) {
      return new Error(
        "An account with this email already exists. Please sign in instead."
      );
    }

    // Invalid email format
    if (
      error.status === 400 &&
      (error.message.includes("Invalid email") ||
        error.message.includes("email format") ||
        error.code === "invalid_email")
    ) {
      return new Error("Please enter a valid email address.");
    }

    // Weak password
    if (
      error.status === 400 &&
      ((error.message.includes("Password") && error.message.includes("weak")) ||
        error.message.includes("password is too weak") ||
        error.code === "weak_password")
    ) {
      return new Error(
        "Password is too weak. Please choose a stronger password."
      );
    }
  }

  // Return original error if no mapping found
  return error;
}

/**
 * Authentication context type
 * Provides session state, user information, and authentication methods
 */
interface AuthContextType {
  /** Current Supabase session, null if not authenticated */
  session: Session | null;
  /** Current user object, null if not authenticated */
  user: User | null;
  /** Whether the auth state is still loading */
  loading: boolean;
  /** Signs in a user with email and password */
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Signs up a new user with email and password */
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Signs in a user with Google OAuth */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  /** Signs out the current user */
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider component
 * Provides authentication context to the application
 * Manages user session, authentication state, and provides auth methods
 *
 * @param children - React children components
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Helper to update auth state and sync with Sentry
  // Wrapped in useCallback to maintain stable reference for useEffect dependency
  const updateAuthState = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    setLoading(false);

    // Sync with Sentry
    const user = nextSession?.user;
    Sentry.setUser(
      user
        ? {
            id: user.id,
            email: user.email ?? undefined,
          }
        : null
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        // Check resolved BEFORE setting it to prevent race condition
        if (resolved || !mounted) return;
        resolved = true;

        // Clear timeout since we resolved early
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (error) {
          logError(error, {
            context: "getSession",
            errorType: "session_error",
          });
          updateAuthState(null);
          return;
        }

        updateAuthState(session);
      })
      .catch((err) => {
        // Check resolved BEFORE setting it to prevent race condition
        if (resolved || !mounted) return;
        resolved = true;

        // Clear timeout since we resolved early
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        logError(err, { context: "getSession", errorType: "exception" });
        // Log out on exception - can't get session means auth is broken
        supabase.auth.signOut();
        updateAuthState(null);
      });

    // Fallback: If getSession doesn't resolve in time, log out
    timeoutId = setTimeout(() => {
      if (!resolved && mounted) {
        resolved = true; // Mark as resolved to prevent race condition
        log(
          "getSession timeout - logging out",
          { context: "getSession" },
          "warn"
        );
        supabase.auth.signOut();
        updateAuthState(null);
      }
    }, AUTH_TIMEOUTS.SESSION_FETCH_TIMEOUT);

    // Listen for auth changes - this is the primary source of truth
    // This includes TOKEN_REFRESHED events from Supabase's automatic token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_, session) => {
      // Check mounted flag to prevent state updates after unmount
      if (!mounted) return;

      updateAuthState(session);
    });

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, [updateAuthState]);

  /**
   * Signs in a user with email and password
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise resolving to an object with error property (null if successful)
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: mapAuthError(error, "signIn") };
      }

      return { error: null };
    } catch (err) {
      logError(err, { context: "signIn" });
      return {
        error:
          err instanceof Error ? err : new Error("Unknown error in signIn"),
      };
    }
  }, []);

  /**
   * Signs up a new user with email and password
   * @param email - User's email address
   * @param password - User's password
   * @returns Promise resolving to an object with error property (null if successful)
   */
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { error: mapAuthError(error, "signUp") };
      }

      return { error };
    } catch (err) {
      logError(err, { context: "signUp" });
      return {
        error:
          err instanceof Error ? err : new Error("Unknown error in signUp"),
      };
    }
  }, []);

  /**
   * Signs in a user with Google OAuth
   * Opens a browser for authentication and handles the OAuth callback
   * @returns Promise resolving to an object with error property (null if successful)
   */
  const signInWithGoogle = useCallback(async () => {
    try {
      // For Expo Go, we MUST use the Expo proxy service
      // For Web, we use the window origin
      const isExpoGo = Constants.appOwnership === "expo";
      const isWeb = Platform.OS === "web";

      let redirectTo: string;
      if (isWeb) {
        // For Web, AuthSession.makeRedirectUri() correctly gets the window.location.origin
        redirectTo = AuthSession.makeRedirectUri();
      } else if (isExpoGo) {
        // Use Expo's proxy service for Expo Go - this prevents email app from opening
        // useProxy is valid at runtime but not in types, so we use type assertion
        redirectTo = AuthSession.makeRedirectUri({
          useProxy: true,
        } as Parameters<typeof AuthSession.makeRedirectUri>[0]);
      } else {
        // Use custom scheme for development/production builds
        redirectTo = "com.vaibhavarora.sharemoney://auth/callback";
      }

      // Get the OAuth URL from Supabase
      const { data, error: urlError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: !isWeb,
        },
      });

      if (urlError) {
        return { error: urlError };
      }

      if (!data?.url) {
        return { error: new Error("Failed to get OAuth URL") };
      }

      if (isWeb) {
        // On web, Supabase handles the redirect automatically if skipBrowserRedirect is false
        return { error: null };
      }

      // Open browser for authentication (native platforms only)
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );

      if (result.type === "success") {
        // TypeScript doesn't narrow the type properly, but url exists on success
        const url = (result as { type: "success"; url: string }).url;

        // Extract tokens from URL hash (callback always contains access_token)
        const hashMatch = url.match(/#(.+)/);
        if (!hashMatch || !hashMatch[1]) {
          return { error: new Error("Invalid callback URL: no hash found") };
        }

        const hash = hashMatch[1];
        const accessToken = hash.match(/access_token=([^&]+)/)?.[1];
        const refreshToken = hash.match(/refresh_token=([^&]+)/)?.[1];

        if (!accessToken || !refreshToken) {
          return {
            error: new Error(
              "Missing access_token or refresh_token in callback URL"
            ),
          };
        }

        // Set session directly from tokens
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: decodeURIComponent(accessToken),
          refresh_token: decodeURIComponent(refreshToken),
        });

        if (sessionError) {
          return { error: sessionError };
        }

        // Verify session was created
        const {
          data: { session: verifySession },
          error: verifyError,
        } = await supabase.auth.getSession();

        if (verifyError || !verifySession) {
          return {
            error: new Error("Session was not created after setting tokens"),
          };
        }

        return { error: null };
      }

      if (result.type === "cancel") {
        return { error: new Error("Authentication was cancelled") };
      }

      return { error: new Error("Authentication was cancelled or failed") };
    } catch (error) {
      logError(error, { context: "signInWithGoogle" });
      return {
        error:
          error instanceof Error ? error : new Error("Unknown error occurred"),
      };
    }
  }, []);

  /**
   * Signs out the current user
   * Clears the session state and signs out from Supabase
   */
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    updateAuthState(null);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      session,
      user,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [session, user, loading, signIn, signUp, signInWithGoogle, signOut]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

/**
 * Hook to access the authentication context
 * @returns The authentication context with session, user, loading state, and auth methods
 * @throws Error if used outside of AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
