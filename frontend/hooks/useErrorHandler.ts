import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

/**
 * ✅ Hook for handling errors with auth error detection
 * Automatically redirects to login on 401 errors
 * Returns user-friendly error message for other errors
 */
export const useErrorHandler = () => {
  const { handleAuthError } = useAuth();

  const handleError = useCallback(async (error: any): Promise<string | null> => {
    console.error('[ErrorHandler]', error);

    // Check if it's an authentication error
    if (error?.isAuthError || error?.type === 'AUTH_ERROR') {
      console.log('[ErrorHandler] Auth error detected - handling logout and redirect');
      await handleAuthError(error?.message || 'Your session has expired. Please log in again.');
      return null; // Return null to indicate auth error (already handled)
    }

    // Extract error message
    const errorMessage = error?.message 
      || error?.response?.data?.message 
      || error?.originalError?.response?.data?.message
      || 'An error occurred. Please try again.';

    return errorMessage;
  }, [handleAuthError]);

  return { handleError };
};
