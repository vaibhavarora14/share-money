import { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabase";

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

    // Track if we've processed invitations for the current session to avoid duplicates
    let lastProcessedUserId: string | null = null;

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Update state based on the session
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Process pending invitations only on SIGNED_IN event (not TOKEN_REFRESHED)
      // and only once per user session to avoid redundant calls
      if (session?.user && event === 'SIGNED_IN' && session.user.id !== lastProcessedUserId) {
        try {
          lastProcessedUserId = session.user.id;
          // Call the function to accept pending invitations
          const { error: inviteError } = await supabase.rpc('accept_pending_invitations');
          if (inviteError) {
            console.error('Error processing pending invitations:', inviteError);
            // Don't block the auth flow if invitation processing fails
          }
        } catch (err) {
          console.error('Error processing pending invitations:', err);
          // Don't block the auth flow if invitation processing fails
        }
      }

      // Reset tracking when user signs out
      if (event === 'SIGNED_OUT') {
        lastProcessedUserId = null;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
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

    // Note: Invitation processing is handled by onAuthStateChange to avoid duplicates
    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    // Note: Invitation processing is handled by onAuthStateChange when session is confirmed
    // This avoids duplicate processing and handles email confirmation flows correctly
    return { error };
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

        // Wait for the session to propagate through onAuthStateChange
        // Note: Invitation processing is handled by onAuthStateChange to avoid duplicates
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
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
