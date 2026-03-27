import { AxiosError } from 'axios';

interface ErrorResponse {
  type: string;
  message: string;
  originalError?: AxiosError;
}

/**
 * ✅ FIX 7.2: Handle different error types and provide user-friendly messages
 */
export const handleErrorResponse = (error: any): string => {
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
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  // Handle generic error objects
  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
};

/**
 * Log error with context (disabled in production)
 */
export const logError = (context: string, error: any) => {
  if (__DEV__) {
    console.error(`[${context}]`, error);
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

  const status = error.originalError?.response?.status;
  return status === 408 || status === 429 || status >= 500;
};
