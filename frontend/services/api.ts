import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { AxiosError } from "axios";
import { API_URL as BASE_API_URL } from "./config";

// Use centralized API_URL from config
const API_URL = BASE_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 second timeout
  // Do NOT hardcode Content-Type here.
  // Axios will auto-set 'multipart/form-data' for FormData
  // and 'application/json' for plain JS objects.
});

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ✅ FIX 7.1: Comprehensive error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (!error.response) {
      // Network error
      return Promise.reject({
        type: 'NETWORK_ERROR',
        message: 'Network error. Please check your internet connection.',
        originalError: error,
      });
    }

    const status = error.response.status;

    // Handle specific status codes
    if (status === 401) {
      // Unauthorized - token expired or invalid
      try {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('userId');
      } catch (e) {
        console.error('[API] Error clearing auth:', e);
      }

      return Promise.reject({
        type: 'AUTH_ERROR',
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
        originalUrl: error.response?.config?.url,
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
      return Promise.reject({
        type: 'SERVER_ERROR',
        message: 'Server error. Please try again later.',
        originalError: error,
      });
    }

    // Generic error response from server
    const errorMessage =
      (error.response.data as any)?.message || 'An error occurred';

    return Promise.reject({
      type: 'API_ERROR',
      message: errorMessage,
      originalError: error,
    });
  }
);

// Generic functions for authenticated requests
export const get = async (url: string) => {
  const response = await api.get(url);
  return response.data;
};

export const post = async (url: string, data: any) => {
  const response = await api.post(url, data);
  return response.data;
};

export const put = async (url: string, data: any) => {
  const response = await api.put(url, data);
  return response.data;
};

export const del = async (url: string) => {
  const response = await api.delete(url);
  return response.data;
};

export default api;
