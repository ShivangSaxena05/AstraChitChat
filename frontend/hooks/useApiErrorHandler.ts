import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';
import { Alert } from 'react-native';

/**
 * Hook to handle API errors consistently across the app
 * Automatically redirects to login on 401 (Unauthorized)
 * 
 * Usage:
 * const handleApiError = useApiErrorHandler();
 * 
 * try {
 *   const data = await get('/endpoint');
 * } catch (error) {
 *   handleApiError(error, 'Failed to fetch data');
 * }
 */
export function useApiErrorHandler() {
  const { handleAuthError } = useAuth();

  const handleApiError = useCallback(
    async (error: any, defaultMessage: string = 'Something went wrong') => {
      // Log the error
      console.error('[useApiErrorHandler] Error:', error);

      // Check if it's an auth error (401 Unauthorized)
      if (error?.isAuthError) {
        console.log('[useApiErrorHandler] 🔐 Auth error detected - redirecting to login');
        await handleAuthError(error?.message || 'Your session has expired. Please log in again.');
        return;
      }

      // Handle network errors
      if (error?.type === 'NETWORK_ERROR') {
        Alert.alert('Network Error', error?.message || 'Please check your internet connection.');
        return;
      }

      // Handle permission errors
      if (error?.type === 'PERMISSION_ERROR') {
        Alert.alert('Permission Denied', error?.message || 'You do not have permission to perform this action.');
        return;
      }

      // Handle other errors
      const errorMessage = error?.message || error?.originalError?.message || defaultMessage;
      Alert.alert('Error', errorMessage);
    },
    [handleAuthError],
  );

  return handleApiError;
}
