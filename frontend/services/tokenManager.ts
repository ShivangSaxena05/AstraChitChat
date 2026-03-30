import AsyncStorage from '@react-native-async-storage/async-storage';
import { get } from './api';

/**
 * ✅ FIX 1.1: Comprehensive token validation
 */
export const validateToken = async (token: string): Promise<boolean> => {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return false;
  }

  try {
    // Try to verify token by calling a protected endpoint
    const response = await get('/profile/me');
    
    // If we get a response, token is valid
    return !!response;
  } catch (error: any) {
    // If 401, token is invalid/expired
    if (error?.response?.status === 401) {
      return false;
    }

    // For other errors, assume network issue and return true
    // (don't sign user out on network errors)
    console.warn('[TokenManager] Error validating token:', error?.message);
    return true;
  }
};

/**
 * Check if token exists and appears valid
 */
export const hasValidToken = async (): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return false;

    return await validateToken(token);
  } catch (error) {
    console.error('[TokenManager] Error checking token:', error);
    return false;
  }
};

/**
 * Clear token and related data
 */
export const clearToken = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(['token', 'userId', 'userName']);
  } catch (error) {
    console.error('[TokenManager] Error clearing token:', error);
  }
};
