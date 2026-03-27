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

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Error handling without verbose logging in production
    return Promise.reject(error);
  },
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
