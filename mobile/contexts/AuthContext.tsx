import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    try {
      // Create redirect URI
      const redirectTo = AuthSession.makeRedirectUri({
        scheme: 'com.sharemoney.app',
        path: 'auth/callback',
      });

      // Get the OAuth URL from Supabase
      const { data, error: urlError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (urlError) {
        return { error: urlError };
      }

      if (!data?.url) {
        return { error: new Error('Failed to get OAuth URL') };
      }

      // Open browser for authentication
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );

      if (result.type === 'success') {
        // Extract the URL from the result
        const url = result.url;
        
        // Parse the URL - handle both full URLs and custom scheme URLs
        let urlObj: URL;
        try {
          urlObj = new URL(url);
        } catch {
          // If URL parsing fails, try to extract code from hash or query string manually
          const hashMatch = url.match(/[#&]code=([^&]+)/);
          const queryMatch = url.match(/[?&]code=([^&]+)/);
          const code = hashMatch?.[1] || queryMatch?.[1];
          
          if (code) {
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) {
              return { error: sessionError };
            }
            return { error: null };
          }
          
          return { error: new Error('Failed to parse OAuth callback URL') };
        }
        
        // Extract the code from query params or hash
        const code = urlObj.searchParams.get('code') || 
                     urlObj.hash.match(/code=([^&]+)/)?.[1];
        
        if (code) {
          // Exchange the code for a session
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          
          if (sessionError) {
            return { error: sessionError };
          }
          
          // Session is automatically updated via onAuthStateChange
          return { error: null };
        }
        
        return { error: new Error('No authorization code found in callback') };
      }

      if (result.type === 'cancel') {
        return { error: new Error('Authentication was cancelled') };
      }

      return { error: new Error('Authentication was cancelled or failed') };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
