import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import secureTokenManager from '@/services/secureTokenManager';
import { hasValidToken } from '@/services/tokenManager';

interface AuthContextType {
  /** Whether the auth check on startup has completed */
  isLoading: boolean;
  /** Whether the user is currently signed in with a valid token */
  isSignedIn: boolean;
  /**
   * Call this after a successful login and token storage.
   * Sets isSignedIn = true and connects the socket.
   */
  signIn: (connectSocket?: () => Promise<void>) => Promise<void>;
  /**
   * Call this to log the user out.
   * Clears tokens, disconnects socket, sets isSignedIn = false.
   */
  signOut: () => Promise<void>;
  /**
   * Handle a 401 auth error from the API layer.
   * Equivalent to signOut but triggered by an expired/invalid token.
   */
  handleAuthError: (message?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{
  children: React.ReactNode;
  socketDisconnect?: () => void;
}> = ({ children, socketDisconnect }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Keep refs stable to avoid stale closures in async callbacks
  const routerRef = useRef(router);
  const socketDisconnectRef = useRef<(() => void) | null>(socketDisconnect || null);

  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { socketDisconnectRef.current = socketDisconnect || null; }, [socketDisconnect]);

  // Check token on app start — this is the SINGLE source of truth for isSignedIn
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const valid = await hasValidToken();
        console.log('[AuthContext] Session restore completed. Token valid:', valid);
        setIsSignedIn(valid);
        if (!valid) {
          // Clear any stale/invalid token data
          console.log('[AuthContext] No valid token found — clearing stored credentials');
          await secureTokenManager.clearAll();
        }
      } catch (e) {
        console.error('[AuthContext] Session restore failed:', e);
        setIsSignedIn(false);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const signIn = useCallback(async (connectSocket?: () => Promise<void>) => {
    // Connect socket first (token is already in storage at this point)
    if (connectSocket) {
      try {
        await connectSocket();
      } catch (e) {
        console.warn('[Auth] Socket connect failed during signIn, continuing:', e);
      }
    }
    // Flip auth gate so _layout.tsx registers authenticated routes
    setIsSignedIn(true);
    // Then navigate — changing Stack.Screen registrations alone doesn't navigate in Expo Router
    setTimeout(() => {
      routerRef.current.replace('/(tabs)' as any);
    }, 0);
  }, []);

  const signOut = useCallback(async () => {
    console.log('[AuthContext] signOut called — clearing credentials and redirecting to login');
    // 1. Disconnect socket first (before clearing credentials)
    if (socketDisconnectRef.current) {
      socketDisconnectRef.current();
    }
    // 2. Clear all stored credentials
    await secureTokenManager.clearAll();
    // 3. Flip auth gate — _layout.tsx switches to login routes
    setIsSignedIn(false);
    // 4. Navigate (belt-and-suspenders in case router needs a push)
    setTimeout(() => {
      console.log('[AuthContext] Navigating to login screen');
      routerRef.current.replace('/auth/login');
    }, 0);
  }, []);

  const handleAuthError = useCallback(async (message?: string) => {
    console.warn('[Auth] Auth error — signing out:', message);
    await signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ isLoading, isSignedIn, signIn, signOut, handleAuthError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
