import { AxiosError } from 'axios';

interface ErrorResponse {
  type: string;
  message: string;
  originalError?: AxiosError;
}

/**
 * PRODUCTION ERROR HANDLER
 * Handles different error types and provides user-friendly messages
 * Prevents app crashes by catching and managing errors gracefully
 */
export const handleErrorResponse = (error: any): string => {
  try {
    // Handle network errors
    if (error?.code === 'ECONNREFUSED' || error?.message?.includes('Network Error')) {
      return 'Network connection failed. Please check your internet connection.';
    }

    // Handle timeout
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    // Handle our custom error format
    if (error && typeof error === 'object') {
      if (error.type === 'NETWORK_ERROR') {
        return 'Network error. Please check your internet connection.';
      }

      if (error.type === 'AUTH_ERROR') {
        return 'Your session has expired. Please log in again.';
      }

      if (error.type === 'PERMISSION_ERROR') {
        return 'You do not have permission to perform this action.';
      }

      if (error.type === 'NOT_FOUND') {
        return 'Resource not found.';
      }

      if (error.type === 'RATE_LIMIT') {
        return 'Too many requests. Please wait before trying again.';
      }

      if (error.type === 'SERVER_ERROR') {
        return 'Server error. Please try again later.';
      }

      if (error.message) {
        return error.message;
      }
    }

    // Handle axios errors
    if (error?.response?.status) {
      const status = error.response.status;
      if (status === 401) {
        return 'Unauthorized. Please log in again.';
      }
      if (status === 403) {
        return 'Access denied. You do not have permission for this action.';
      }
      if (status === 404) {
        return 'Resource not found.';
      }
      if (status === 429) {
        return 'Too many requests. Please try again later.';
      }
      if (status >= 500) {
        return 'Server error. Please try again later.';
      }
      if (error.response?.data?.message) {
        return error.response.data.message;
      }
    }

    // Handle generic error objects
    if (error?.message && typeof error.message === 'string') {
      // Filter out noise
      if (error.message.length < 500) {
        return error.message;
      }
    }

    return 'An unexpected error occurred. Please try again.';
  } catch (parseError) {
    console.error('[ErrorHandler] Failed to handle error:', parseError);
    return 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Safe error logging (disabled in production)
 */
export const logError = (context: string, error: any) => {
  if (__DEV__) {
    console.error(`[${context}]`, error);
  } else {
    // In production, send to error tracking service (e.g., Sentry)
    // sentryClient.captureException(error, { tags: { context } });
  }
};

/**
 * Determine if error is retryable
 */
export const isRetryableError = (error: any): boolean => {
  if (!error) return false;

  if (error.type === 'NETWORK_ERROR' || error.type === 'RATE_LIMIT') {
    return true;
  }

  // Retryable HTTP status codes
  const status = error.response?.status || error.originalError?.response?.status;
  return status === 408 || status === 429 || (status >= 500 && status < 600);
};

/**
 * Safe async function wrapper with error handling
 */
export const tryCatch = async <T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    return fallback;
  }
};

/**
 * Format native module error
 */
export const getNativeModuleError = (moduleName: string): string => {
  const messages: Record<string, string> = {
    ExpoCamera: 'Camera is not available. You can still upload from your gallery.',
    RNCNetInfo: 'Network monitoring is limited.',
    RNFSManager: 'File operations may be limited.',
    RNCPushNotification: 'Push notifications are not available.',
    ExpoPushNotification: 'Push notifications are not available.',
  };
  
  return messages[moduleName] || `The ${moduleName} module is not available.`;
};
