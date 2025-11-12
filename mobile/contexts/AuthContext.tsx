import { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { queryClient } from "../utils/queryClient";

// API URL - must be set via EXPO_PUBLIC_API_URL environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Helper function to accept pending invitations for a user
const acceptPendingInvitations = async (userEmail: string, accessToken: string): Promise<number> => {
  if (!API_URL || !userEmail) {
    return 0;
  }

  try {
    // Call the database function to accept all pending invitations for this email
    const { data, error } = await supabase.rpc('accept_pending_invitations_for_user', {
      user_email: userEmail,
    });

    if (error) {
      console.error('Error accepting pending invitations:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in acceptPendingInvitations:', error);
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
        console.error("Error getting initial session:", error);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Update state based on the session
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Auto-accept pending invitations when user signs in or signs up
      if (session?.user?.email && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        try {
          await acceptPendingInvitations(
            session.user.email,
            session.access_token
          );
        } catch (error) {
          console.error('Error auto-accepting invitations:', error);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
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
          console.error('Error auto-accepting invitations on sign in:', err);
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
          console.error('Error auto-accepting invitations on sign up:', err);
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
        redirectTo = "com.sharemoney.app://auth/callback";
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
            console.error('Error auto-accepting invitations on Google sign in:', err);
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

  const signOut = async () => {
    // Immediately clear the session state
    setSession(null);
    setUser(null);

    // Clear the session from Supabase storage
    await supabase.auth.signOut();

    // Clear React Query cache to prevent data leakage between users
    queryClient.clear();
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
