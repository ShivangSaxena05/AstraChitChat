import { Platform } from 'react-native';

// Import secure store only for native platforms
let getItemAsync: (key: string) => Promise<string | null>;
let setItemAsync: (key: string, value: string) => Promise<void>;
let deleteItemAsync: (key: string) => Promise<void>;

// Platform-specific initialization
if (Platform.OS === 'web') {
  // Web fallback: Use localStorage (persistent across page reloads)
  getItemAsync = async (key: string) => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    } catch (e) {
      console.error('[SecureStore] Web storage error:', e);
      return null;
    }
  };

  setItemAsync = async (key: string, value: string) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.error('[SecureStore] Web storage error:', e);
      throw e;
    }
  };

  deleteItemAsync = async (key: string) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.error('[SecureStore] Web storage error:', e);
      throw e;
    }
  };
} else {
  // Native platforms: Use expo-secure-store
  const SecureStore = require('expo-secure-store');
  getItemAsync = SecureStore.getItemAsync;
  setItemAsync = SecureStore.setItemAsync;
  deleteItemAsync = SecureStore.deleteItemAsync;
}

const TOKEN_KEY = 'auth_token';
const USER_ID_KEY = 'user_id';
const REFRESH_TOKEN_KEY = 'refresh_token';

/**
 * Secure Token Manager
 * 
 * Stores authentication tokens in platform-specific secure storage:
 * - iOS: Keychain (Apple's secure credential storage)
 * - Android: Keystore (Google's secure credential storage)
 * - Web: LocalStorage (persistent across page reloads)
 * 
 * This prevents tokens from being accessed via:
 * - ADB (Android Debug Bridge)
 * - Jailbreak tools (iOS)
 * - Device theft with USB debugging
 * 
 * @security HIGH - Critical for mobile security
 */

export const secureTokenManager = {
  /**
   * Store token securely in Keychain (iOS) or Keystore (Android)
   * 
   * @param token - JWT token to store
   * @throws Error if secure storage fails
   */
  async setToken(token: string): Promise<void> {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token provided');
      }
      console.log('[SecureStore] 💾 Saving token... Length:', token.length);
      await setItemAsync(TOKEN_KEY, token);
      console.log('[SecureStore] ✅ Token saved successfully');
    } catch (error) {
      console.error('[SecureStore] ❌ Failed to save token:', error);
      throw new Error('Failed to secure authentication token');
    }
  },

  /**
   * Retrieve token from secure storage
   * 
   * @returns JWT token or null if not stored
   */
  async getToken(): Promise<string | null> {
    try {
      const token = await getItemAsync(TOKEN_KEY);
      if (token) {
        console.log('[SecureStore] ✅ Token retrieved successfully. Length:', token.length);
      } else {
        console.warn('[SecureStore] ⚠️ No token found in secure storage');
      }
      return token;
    } catch (error) {
      console.error('[SecureStore] ❌ Failed to retrieve token:', error);
      return null;
    }
  },

  /**
   * Store refresh token for token refresh flow
   * 
   * @param token - Refresh token to store
   */
  async setRefreshToken(token: string): Promise<void> {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid refresh token provided');
      }
      await setItemAsync(REFRESH_TOKEN_KEY, token);
    } catch (error) {
      console.error('[SecureStore] Failed to save refresh token:', error);
      throw error;
    }
  },

  /**
   * Get refresh token
   * 
   * @returns Refresh token or null if not stored
   */
  async getRefreshToken(): Promise<string | null> {
    try {
      return await getItemAsync(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('[SecureStore] Failed to retrieve refresh token:', error);
      return null;
    }
  },

  /**
   * Clear all authentication data from secure storage
   * 
   * Call this on logout to ensure tokens are completely removed
   */
  async clearAll(): Promise<void> {
    try {
      await Promise.all([
        deleteItemAsync(TOKEN_KEY),
        deleteItemAsync(REFRESH_TOKEN_KEY),
        deleteItemAsync(USER_ID_KEY),
      ]);
    } catch (error) {
      console.error('[SecureStore] Failed to clear tokens:', error);
      // Don't throw - best effort cleanup
    }
  },

  /**
   * Store user ID (non-sensitive metadata)
   * 
   * User ID is not sensitive like tokens, but stored in SecureStore
   * for consistency and to prevent casual inspection
   * 
   * @param userId - User ID from authentication response
   */
  async setUserId(userId: string): Promise<void> {
    try {
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID provided');
      }
      await setItemAsync(USER_ID_KEY, userId);
    } catch (error) {
      console.error('[SecureStore] Failed to save user ID:', error);
      // Non-critical, don't throw
    }
  },

  /**
   * Get user ID
   * 
   * @returns User ID or null if not stored
   */
  async getUserId(): Promise<string | null> {
    try {
      return await getItemAsync(USER_ID_KEY);
    } catch (error) {
      console.error('[SecureStore] Failed to retrieve user ID:', error);
      return null;
    }
  },

  /**
   * Check if token exists in secure storage
   * 
   * @returns true if token is stored, false otherwise
   */
  async hasToken(): Promise<boolean> {
    try {
      const token = await this.getToken();
      return !!token;
    } catch (error) {
      console.error('[SecureStore] Error checking token existence:', error);
      return false;
    }
  },
};

export default secureTokenManager;
