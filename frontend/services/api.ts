import axios, { AxiosError } from "axios";
import { API_URL as BASE_API_URL } from "./config";
import secureTokenManager from "./secureTokenManager";

// Use centralized API_URL from config
const API_URL = BASE_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 120 second timeout - increased for large file uploads
  // Do NOT hardcode Content-Type here.
  // Axios will auto-set 'multipart/form-data' for FormData
  // and 'application/json' for plain JS objects.
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  validateStatus: function (status) {
    // Accept all status codes; handle errors in interceptor
    return status <= 500;
  },
  httpAgent: undefined, // Disable HTTP agent (using HTTPS)
  httpsAgent: undefined, // Let axios use default HTTPS agent
});

// ✅ FIX: Add request interceptor to include JWT token from secure storage
api.interceptors.request.use(
  async (config) => {
    try {
      // ✅ SECURE: Retrieve token from encrypted storage (iOS Keychain / Android Keystore)
      const token = await secureTokenManager.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('[API] ✅ Token attached to request:', config.url, '| Token length:', token.length);
      } else {
        console.warn('[API] ⚠️ NO TOKEN FOUND in secure storage for:', config.url);
      }
    } catch (error) {
      console.error('[API] ❌ Error retrieving token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ✅ FIX 7.1: Comprehensive error handling with secure storage cleanup
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    try {
      // Handle network errors gracefully
      if (!error.response) {
        console.error('[API] Network error:', error.message);
        return Promise.reject({
          type: 'NETWORK_ERROR',
          message: 'Network error. Please check your internet connection.',
          originalError: error,
        });
      }

      const status = error.response.status;

      // Handle specific status codes with error handling
      if (status === 401) {
        try {
          const hadToken = await secureTokenManager.hasToken();
          if (hadToken) {
            console.log('[API] Token rejected by server (401) — clearing stored token');
            await secureTokenManager.clearAll();
          }
        } catch (e) {
          console.error('[API] Error clearing auth:', e);
        }

        return Promise.reject({
          type: 'AUTH_ERROR',
          isAuthError: true,
          message: 'Your session has expired. Please log in again.',
          originalError: error,
        });
      }

      if (status === 403) {
        return Promise.reject({
          type: 'PERMISSION_ERROR',
          message: 'You do not have permission to perform this action.',
          originalError: error,
        });
      }

      if (status === 404) {
        console.warn('[API] 404 Not Found:', {
          url: error.config?.url,
          method: error.config?.method,
        });
        return Promise.reject({
          type: 'NOT_FOUND',
          message: 'Resource not found.',
          originalError: error,
        });
      }

      if (status === 429) {
        return Promise.reject({
          type: 'RATE_LIMIT',
          message: 'Too many requests. Please wait before trying again.',
          originalError: error,
        });
      }

      if (status >= 500) {
        console.error('[API] Server error:', status);
        return Promise.reject({
          type: 'SERVER_ERROR',
          message: 'Server error. Please try again later.',
          originalError: error,
        });
      }

      // Generic error response from server
      const errorMessage =
        (error.response.data as any)?.message || 'An error occurred';

      // Check if error message indicates missing/invalid token
      const isMissingTokenError = 
        errorMessage?.toLowerCase().includes('no token') ||
        errorMessage?.toLowerCase().includes('not authorized') ||
        errorMessage?.toLowerCase().includes('invalid token') ||
        errorMessage?.toLowerCase().includes('token') ||
        (error.response.data as any)?.error?.toLowerCase().includes('token');

      if (isMissingTokenError && status === 401) {
        console.log('[API] Missing/invalid token error detected — this is an AUTH_ERROR');
        try {
          const hadToken = await secureTokenManager.hasToken();
          if (hadToken) {
            console.log('[API] Token found in storage but rejected by server (401)');
            await secureTokenManager.clearAll();
          } else {
            console.log('[API] No token in storage — user is not authenticated');
          }
        } catch (e) {
          console.error('[API] Error checking token state:', e);
        }

        return Promise.reject({
          type: 'AUTH_ERROR',
          isAuthError: true,
          message: 'Your session has expired. Please log in again.',
          originalError: error,
        });
      }

      return Promise.reject({
        type: 'API_ERROR',
        message: errorMessage,
        originalError: error,
      });
    } catch (handlingError) {
      console.error('[API] Error in response interceptor:', handlingError);
      // Return original error if handling fails
      return Promise.reject(error);
    }
  }
);

// ✅ PRODUCTION: Add retry logic for failed requests with error handling
const MAX_RETRIES = 2;

const retryRequest = async (
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  data?: any
): Promise<any> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (method === 'get') {
        const response = await api.get(url);
        return response.data;
      } else if (method === 'post') {
        const response = await api.post(url, data);
        return response.data;
      } else if (method === 'put') {
        const response = await api.put(url, data);
        return response.data;
      } else if (method === 'delete') {
        const response = await api.delete(url);
        return response.data;
      }
    } catch (error: any) {
      lastError = error;
      
      // Don't retry for auth/permission errors
      if (error?.type === 'AUTH_ERROR' || error?.type === 'PERMISSION_ERROR') {
        throw error;
      }
      
      // Retry on network or server errors only
      const isRetryable = error?.type === 'NETWORK_ERROR' || error?.type === 'SERVER_ERROR' || error?.type === 'RATE_LIMIT';
      
      if (attempt < MAX_RETRIES && isRetryable) {
        const delayMs = 1000 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
        console.log(`[API] Retry attempt ${attempt + 1}/${MAX_RETRIES} for ${method.toUpperCase()} ${url} (waiting ${delayMs}ms)`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } catch (delayError) {
          console.error('[API] Error during retry delay:', delayError);
        }
        continue;
      }
      
      // Don't retry if max attempts reached or error is not retryable
      break;
    }
  }
  
  throw lastError;
};

// Generic functions for authenticated requests with error boundaries
export const get = async (url: string) => {
  try {
    return await retryRequest('get', url);
  } catch (error) {
    console.error('[API] GET failed:', url, error);
    throw error;
  }
};

export const post = async (url: string, data: any) => {
  try {
    return await retryRequest('post', url, data);
  } catch (error) {
    console.error('[API] POST failed:', url, error);
    throw error;
  }
};

export const put = async (url: string, data: any) => {
  try {
    return await retryRequest('put', url, data);
  } catch (error) {
    console.error('[API] PUT failed:', url, error);
    throw error;
  }
};

export const del = async (url: string) => {
  try {
    return await retryRequest('delete', url);
  } catch (error) {
    console.error('[API] DELETE failed:', url, error);
    throw error;
  }
};

// ✅ NEW: Create a wrapper that adds global error handling
// This can be imported by hooks/components to add auth error interception
export const createApiCallWithErrorHandling = (onAuthError?: () => Promise<void>) => {
  return {
    get: async (url: string) => {
      try {
        return await get(url);
      } catch (error: any) {
        if (error?.isAuthError && onAuthError) {
          await onAuthError();
        }
        throw error;
      }
    },
    post: async (url: string, data: any) => {
      try {
        return await post(url, data);
      } catch (error: any) {
        if (error?.isAuthError && onAuthError) {
          await onAuthError();
        }
        throw error;
      }
    },
    put: async (url: string, data: any) => {
      try {
        return await put(url, data);
      } catch (error: any) {
        if (error?.isAuthError && onAuthError) {
          await onAuthError();
        }
        throw error;
      }
    },
    del: async (url: string) => {
      try {
        return await del(url);
      } catch (error: any) {
        if (error?.isAuthError && onAuthError) {
          await onAuthError();
        }
        throw error;
      }
    },
  };
};

export default api;
