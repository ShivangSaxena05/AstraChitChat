import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL as BASE_API_URL } from './config';

// Use centralized API_URL from config
const API_URL = BASE_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    console.log('Token from storage:', token);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Authorization header set');
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    console.error('Error response:', error.response);
    console.error('Error config:', error.config);
    return Promise.reject(error);
  }
);

// Generic functions for authenticated requests
export const get = async (url: string) => {
  const response = await api.get(url);
  return response.data;
};

export const post = async (url: string, data: any) => {
  if (data && data.method === 'DELETE') {
    const response = await api.delete(url);
    return response.data;
  }
  // If data is FormData, let axios set the Content-Type automatically with proper boundary
  if (data instanceof FormData) {
    const response = await api.post(url, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
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
