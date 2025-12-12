import * as Sentry from "@sentry/react-native";
import { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { AUTH_TIMEOUTS } from "../constants/auth";
import { supabase } from "../supabase";
import { log, logError } from "../utils/logger";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Helper function to accept pending invitations for a user
const acceptPendingInvitations = async (
  userEmail: string,
  accessToken: string
): Promise<number> => {
  if (!API_URL || !userEmail) {
    return 0;
  }

  try {
    // Call the database function to accept all pending invitations for this email
    const { data, error } = await supabase.rpc(
      "accept_pending_invitations_for_user",
      {
        user_email: userEmail,
      }
    );

    if (error) {
      console.error("Error accepting pending invitations:", error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error("Error in acceptPendingInvitations:", error);
    return 0;
  }
};

// Complete the auth session when browser closes
WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  forceRefreshSession: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Keep Sentry user in sync with Supabase session
  const applyUserToSentry = (nextSession: Session | null) => {
    const user = nextSession?.user;
    if (user) {
      Sentry.setUser({
        id: user.id,
        email: user.email ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    // Get initial session
    log("[Auth] Initial getSession start");
    Sentry.addBreadcrumb({
      category: "auth",
      message: "getSession started",
      level: "info",
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        resolved = true;
        Sentry.addBreadcrumb({
          category: "auth",
          message: "getSession resolved",
          level: "info",
          data: {
            hasSession: !!session,
            hasError: !!error,
            mounted,
            expiresAt: session?.expires_at,
          },
        });
        if (!mounted) {
          Sentry.addBreadcrumb({
            category: "auth",
            message: "getSession resolved but component unmounted",
            level: "warning",
          });
          return;
        }
        if (error) {
          logError(error, { context: "Initial getSession" });
        }
        log("[Auth] Initial getSession result", {
          hasSession: !!session,
          error: error ? String(error) : null,
        });
        setSession(session);
        setUser(session?.user ?? null);
        applyUserToSentry(session);
        setLoading(false);
        Sentry.addBreadcrumb({
          category: "auth",
          message: "Auth state updated, loading=false",
          level: "info",
        });
      })
      .catch((err) => {
        resolved = true;
        Sentry.addBreadcrumb({
          category: "auth",
          message: "getSession catch",
          level: "error",
          data: { error: err?.message, mounted },
        });
        if (!mounted) return;
        logError(err, { context: "Initial getSession catch" });
        setLoading(false);
      });

    // Fallback: If getSession doesn't resolve in 10s, force loading=false
    const fallbackTimeout = setTimeout(() => {
      if (!resolved && mounted) {
        resolved = true; // Mark as resolved to prevent race condition
        Sentry.captureMessage("getSession timeout - forcing loading=false", {
          level: "warning",
          tags: { issue: "auth_timeout" },
        });
        setLoading(false);
        // Attempt recovery by refreshing session
        supabase.auth
          .refreshSession()
          .then(({ data, error }) => {
            if (mounted && data.session) {
              setSession(data.session);
              setUser(data.session.user);
              applyUserToSentry(data.session);
            } else if (error) {
              Sentry.captureException(error, {
                tags: { issue: "auth_timeout_refresh_failed" },
              });
            }
          })
          .catch((err) => {
            if (mounted) {
              Sentry.captureException(err, {
                tags: { issue: "auth_timeout_refresh_error" },
              });
            }
          });
      }
    }, AUTH_TIMEOUTS.SESSION_FETCH_TIMEOUT);

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      Sentry.addBreadcrumb({
        category: "auth",
        message: `onAuthStateChange: ${event}`,
        level: "info",
        data: { hasSession: !!session, mounted },
      });

      log("[Auth] onAuthStateChange", {
        event,
        hasSession: !!session,
      });

      // Update state based on the session
      setSession(session);
      setUser(session?.user ?? null);
      applyUserToSentry(session);
      setLoading(false);

      // Auto-accept pending invitations when user signs in or signs up
      if (
        session?.user?.email &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        try {
          await acceptPendingInvitations(
            session.user.email,
            session.access_token
          );
        } catch (error) {
          logError(error, { context: "acceptPendingInvitations", event });
        }
      }
    });

    // Handle app state changes (app resume/foreground)
    // Use debouncing to prevent rapid session checks when user quickly switches apps
    let appStateCheckTimeout: NodeJS.Timeout | null = null;
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        // Clear any pending check
        if (appStateCheckTimeout) {
          clearTimeout(appStateCheckTimeout);
        }
        // Debounce rapid state changes
        appStateCheckTimeout = setTimeout(async () => {
          Sentry.addBreadcrumb({
            category: "auth",
            message: "App became active, checking session",
            level: "info",
          });
          try {
            const {
              data: { session },
              error,
            } = await supabase.auth.getSession();
            if (!mounted) return;
            if (error) {
              Sentry.addBreadcrumb({
                category: "auth",
                message: "Session check on resume failed",
                level: "error",
                data: { error: error.message },
              });
              setLoading(false);
              return; // Don't update session state on error
            }
            setSession(session);
            setUser(session?.user ?? null);
            applyUserToSentry(session);
            setLoading(false);
          } catch (err) {
            if (!mounted) return;
            Sentry.addBreadcrumb({
              category: "auth",
              message: "AppState session check error",
              level: "error",
              data: { error: (err as Error)?.message },
            });
            setLoading(false);
          }
        }, AUTH_TIMEOUTS.APP_STATE_DEBOUNCE);
      }
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      mounted = false;
      clearTimeout(fallbackTimeout);
      if (appStateCheckTimeout) {
        clearTimeout(appStateCheckTimeout);
      }
      subscription.unsubscribe();
      appStateSubscription.remove();
      Sentry.addBreadcrumb({
        category: "auth",
        message: "Auth useEffect cleanup",
        level: "info",
      });
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Check for invalid credentials (400 error)
        if (
          error.status === 400 &&
          (error.message.includes("Invalid login credentials") ||
            error.message.includes("invalid_credentials") ||
            (error as any).code === "invalid_credentials")
        ) {
          return {
            error: new Error(
              "Invalid email or password. Please check your credentials and try again."
            ),
          };
        }

        // Check for rate limit errors
        if (
          error.status === 429 ||
          error.message.includes("rate limit") ||
          error.message.includes("429")
        ) {
          return {
            error: new Error(
              "Too many sign-in attempts. Please wait a moment and try again."
            ),
          };
        }

        // Check if it's an email confirmation error
        if (
          error.message.includes("email") &&
          error.message.includes("confirm")
        ) {
          return {
            error: new Error(
              "Please check your email and confirm your account before signing in."
            ),
          };
        }
        return { error };
      }

      // Auto-accept pending invitations after successful sign in
      if (data?.user?.email && data?.session?.access_token) {
        try {
          await acceptPendingInvitations(
            data.user.email,
            data.session.access_token
          );
        } catch (err) {
          console.error("Error auto-accepting invitations on sign in:", err);
        }
      }

      return { error: null };
    } catch (err) {
      console.error("Error in signIn:", err);
      return {
        error:
          err instanceof Error ? err : new Error("Unknown error in signIn"),
      };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        // Check for user already exists (400 error)
        if (
          error.status === 400 &&
          (error.message.includes("User already registered") ||
            error.message.includes("already registered") ||
            error.message.includes("email address is already registered") ||
            (error as any).code === "user_already_registered")
        ) {
          return {
            error: new Error(
              "An account with this email already exists. Please sign in instead."
            ),
          };
        }

        // Check for invalid email format
        if (
          error.status === 400 &&
          (error.message.includes("Invalid email") ||
            error.message.includes("email format") ||
            (error as any).code === "invalid_email")
        ) {
          return {
            error: new Error("Please enter a valid email address."),
          };
        }

        // Check for weak password
        if (
          error.status === 400 &&
          ((error.message.includes("Password") &&
            error.message.includes("weak")) ||
            error.message.includes("password is too weak") ||
            (error as any).code === "weak_password")
        ) {
          return {
            error: new Error(
              "Password is too weak. Please choose a stronger password."
            ),
          };
        }
      }

      // Auto-accept pending invitations after successful sign up
      if (data?.user?.email && data?.session?.access_token) {
        try {
          await acceptPendingInvitations(
            data.user.email,
            data.session.access_token
          );
        } catch (err) {
          console.error("Error auto-accepting invitations on sign up:", err);
        }
      }

      return { error };
    } catch (err) {
      console.error("Error in signUp:", err);
      return {
        error:
          err instanceof Error ? err : new Error("Unknown error in signUp"),
      };
    }
  };

  const signInWithGoogle = async () => {
    try {
      // For Expo Go, we MUST use the Expo proxy service
      // Custom URL schemes don't work in Expo Go and may open email app
      const isExpoGo = Constants.appOwnership === "expo";

      let redirectTo: string;
      if (isExpoGo) {
        // Use Expo's proxy service for Expo Go - this prevents email app from opening
        // @ts-ignore - useProxy is valid at runtime but not in types
        redirectTo = AuthSession.makeRedirectUri({ useProxy: true });
      } else {
        // Use custom scheme for development/production builds
        redirectTo = "com.vaibhavarora.sharemoney://auth/callback";
      }

      // Get the OAuth URL from Supabase
      const { data, error: urlError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (urlError) {
        return { error: urlError };
      }

      if (!data?.url) {
        return { error: new Error("Failed to get OAuth URL") };
      }

      // Open browser for authentication
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );

      if (result.type === "success") {
        // @ts-ignore - url property exists on success result
        const url = result.url;

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

        // Auto-accept pending invitations after successful Google sign in
        if (verifySession?.user?.email && verifySession?.access_token) {
          try {
            await acceptPendingInvitations(
              verifySession.user.email,
              verifySession.access_token
            );
          } catch (err) {
            console.error(
              "Error auto-accepting invitations on Google sign in:",
              err
            );
          }
        }

        return { error: null };
      }

      if (result.type === "cancel") {
        return { error: new Error("Authentication was cancelled") };
      }

      return { error: new Error("Authentication was cancelled or failed") };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error : new Error("Unknown error occurred"),
      };
    }
  };

  const forceRefreshSession = async (): Promise<{ error: Error | null }> => {
    try {
      Sentry.addBreadcrumb({
        category: "auth",
        message: "forceRefreshSession called",
        level: "info",
      });

      // First try to refresh the session
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError) {
        Sentry.addBreadcrumb({
          category: "auth",
          message: "forceRefreshSession refresh failed",
          level: "error",
          data: { error: refreshError.message },
        });
        // If refresh fails, try to get current session anyway
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          return {
            error: refreshError || new Error("Failed to get session"),
          };
        }
        // Update state with current session even if refresh failed
        setSession(sessionData.session);
        setUser(sessionData.session.user);
        applyUserToSentry(sessionData.session);
        setLoading(false);
        return { error: null };
      }

      // If refresh succeeded, get the updated session
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        Sentry.addBreadcrumb({
          category: "auth",
          message: "forceRefreshSession getSession failed",
          level: "error",
          data: { error: sessionError.message },
        });
        return { error: sessionError };
      }

      // Explicitly update state with the refreshed session
      const updatedSession = refreshData.session || sessionData.session;
      if (updatedSession) {
        setSession(updatedSession);
        setUser(updatedSession.user);
        applyUserToSentry(updatedSession);
        setLoading(false);
        Sentry.addBreadcrumb({
          category: "auth",
          message: "forceRefreshSession success - state updated",
          level: "info",
          data: { hasSession: true },
        });
        return { error: null };
      }

      // No session found
      setSession(null);
      setUser(null);
      applyUserToSentry(null);
      setLoading(false);
      return { error: new Error("No session found after refresh") };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      Sentry.captureException(error, {
        tags: { issue: "forceRefreshSession_error" },
      });
      // Still set loading to false to unblock the UI
      setLoading(false);
      return { error };
    }
  };

  const signOut = async () => {
    // Immediately clear the session state
    setSession(null);
    setUser(null);
    applyUserToSentry(null);

    // Clear the session from Supabase storage
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        forceRefreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
