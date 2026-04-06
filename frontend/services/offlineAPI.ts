import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { API_URL as BASE_API_URL } from './config';
import secureTokenManager from './secureTokenManager';
import offlineStorage, { CACHE_KEYS, QueuedRequest } from './offlineStorage';

const API_URL = BASE_API_URL;

interface OfflineAPIConfig {
  enableCaching: boolean;
  enableQueue: boolean;
  cacheTTL: number;
  maxQueueRetries: number;
}

class OfflineAwareAPI {
  private api: AxiosInstance;
  private config: OfflineAPIConfig;
  private isSyncing: boolean = false;

  constructor(config: Partial<OfflineAPIConfig> = {}) {
    this.api = axios.create({
      baseURL: API_URL,
      timeout: 15000,
    });

    this.config = {
      enableCaching: true,
      enableQueue: true,
      cacheTTL: 60 * 60 * 1000, // 1 hour
      maxQueueRetries: 3,
      ...config,
    };

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      async (config) => {
        const token = await secureTokenManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (!error.response) {
          // Network error - return cached data if available
          console.log('[OfflineAwareAPI] Network error detected');
          return Promise.reject({
            type: 'NETWORK_ERROR',
            message: 'Network error. Offline mode enabled.',
            originalError: error,
            isOffline: true,
          });
        }

        const status = error.response.status;

        if (status === 401) {
          try {
            await secureTokenManager.clearAll();
          } catch (e) {
            console.error('[OfflineAwareAPI] Error clearing auth:', e);
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

        const errorMessage = (error.response.data as any)?.message || 'An error occurred';
        return Promise.reject({
          type: 'API_ERROR',
          message: errorMessage,
          originalError: error,
        });
      }
    );
  }

  /**
   * GET request with caching support
   */
  async get<T>(url: string, cacheKey?: string, cacheTTL?: number): Promise<T> {
    try {
      // Try to fetch from server
      const response = await this.api.get<T>(url);
      
      // Cache successful response
      if (this.config.enableCaching && cacheKey) {
        await offlineStorage.saveToCache(cacheKey, response.data, cacheTTL || this.config.cacheTTL);
      }

      return response.data;
    } catch (error: any) {
      // If offline, try to return cached data
      if (error.isOffline && cacheKey && this.config.enableCaching) {
        console.log(`[OfflineAwareAPI] Returning cached data for ${cacheKey}`);
        const cached = await offlineStorage.getFromCache<T>(cacheKey);
        if (cached) {
          return cached;
        }
      }
      throw error;
    }
  }

  /**
   * POST request with queue support
   */
  async post<T>(url: string, data: any, shouldQueue: boolean = true): Promise<T> {
    try {
      const response = await this.api.post<T>(url, data);
      return response.data;
    } catch (error: any) {
      // Queue request if offline
      if (error.isOffline && shouldQueue && this.config.enableQueue) {
        console.log(`[OfflineAwareAPI] Queuing POST request to ${url}`);
        await offlineStorage.addToQueue({
          method: 'POST',
          url,
          data,
          maxRetries: this.config.maxQueueRetries,
        });
        
        // Return optimistic response
        return {
          success: true,
          queued: true,
          message: 'Request queued and will be sent when online',
        } as T;
      }
      throw error;
    }
  }

  /**
   * PUT request with queue support
   */
  async put<T>(url: string, data: any, shouldQueue: boolean = true): Promise<T> {
    try {
      const response = await this.api.put<T>(url, data);
      return response.data;
    } catch (error: any) {
      if (error.isOffline && shouldQueue && this.config.enableQueue) {
        console.log(`[OfflineAwareAPI] Queuing PUT request to ${url}`);
        await offlineStorage.addToQueue({
          method: 'PUT',
          url,
          data,
          maxRetries: this.config.maxQueueRetries,
        });
        
        return {
          success: true,
          queued: true,
          message: 'Request queued and will be sent when online',
        } as T;
      }
      throw error;
    }
  }

  /**
   * DELETE request with queue support
   */
  async delete<T>(url: string, shouldQueue: boolean = true): Promise<T> {
    try {
      const response = await this.api.delete<T>(url);
      return response.data;
    } catch (error: any) {
      if (error.isOffline && shouldQueue && this.config.enableQueue) {
        console.log(`[OfflineAwareAPI] Queuing DELETE request to ${url}`);
        await offlineStorage.addToQueue({
          method: 'DELETE',
          url,
          maxRetries: this.config.maxQueueRetries,
        });
        
        return {
          success: true,
          queued: true,
          message: 'Request queued and will be sent when online',
        } as T;
      }
      throw error;
    }
  }

  /**
   * PATCH request with queue support
   */
  async patch<T>(url: string, data: any, shouldQueue: boolean = true): Promise<T> {
    try {
      const response = await this.api.patch<T>(url, data);
      return response.data;
    } catch (error: any) {
      if (error.isOffline && shouldQueue && this.config.enableQueue) {
        console.log(`[OfflineAwareAPI] Queuing PATCH request to ${url}`);
        await offlineStorage.addToQueue({
          method: 'PATCH',
          url,
          data,
          maxRetries: this.config.maxQueueRetries,
        });
        
        return {
          success: true,
          queued: true,
          message: 'Request queued and will be sent when online',
        } as T;
      }
      throw error;
    }
  }

  /**
   * Sync queued requests when back online
   */
  async syncQueue(): Promise<{ successful: number; failed: number }> {
    if (this.isSyncing) {
      console.log('[OfflineAwareAPI] Sync already in progress');
      return { successful: 0, failed: 0 };
    }

    this.isSyncing = true;
    await offlineStorage.setSyncStatus(true);

    try {
      const queue = await offlineStorage.getQueue();
      let successful = 0;
      let failed = 0;

      for (const request of queue) {
        try {
          await this.processQueuedRequest(request);
          await offlineStorage.removeFromQueue(request.id);
          successful++;
        } catch (error) {
          console.error(`[OfflineAwareAPI] Failed to sync request ${request.id}:`, error);
          
          if (request.retries >= request.maxRetries) {
            await offlineStorage.removeFromQueue(request.id);
            failed++;
          } else {
            await offlineStorage.updateRequestRetries(request.id, request.retries + 1);
            failed++;
          }
        }
      }

      console.log(`[OfflineAwareAPI] Queue sync complete: ${successful} successful, ${failed} failed`);
      return { successful, failed };
    } finally {
      this.isSyncing = false;
      await offlineStorage.setSyncStatus(false);
    }
  }

  /**
   * Process individual queued request
   */
  private async processQueuedRequest(request: QueuedRequest): Promise<void> {
    switch (request.method) {
      case 'GET':
        await this.api.get(request.url);
        break;
      case 'POST':
        await this.api.post(request.url, request.data);
        break;
      case 'PUT':
        await this.api.put(request.url, request.data);
        break;
      case 'DELETE':
        await this.api.delete(request.url);
        break;
      case 'PATCH':
        await this.api.patch(request.url, request.data);
        break;
    }
  }

  /**
   * Get queue size
   */
  async getQueueSize(): Promise<number> {
    const queue = await offlineStorage.getQueue();
    return queue.length;
  }

  /**
   * Clear offline queue
   */
  async clearQueue(): Promise<void> {
    await offlineStorage.clearQueue();
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    await offlineStorage.clearAllCache();
  }
}

// Export singleton instance
const offlineAPI = new OfflineAwareAPI({
  enableCaching: true,
  enableQueue: true,
  cacheTTL: 60 * 60 * 1000, // 1 hour
  maxQueueRetries: 3,
});

export default offlineAPI;

// Also export helper functions that use the offline-aware API
export const offlineGet = async <T>(url: string, cacheKey?: string, cacheTTL?: number): Promise<T> => {
  return offlineAPI.get<T>(url, cacheKey, cacheTTL);
};

export const offlinePost = async <T>(url: string, data: any): Promise<T> => {
  return offlineAPI.post<T>(url, data);
};

export const offlinePut = async <T>(url: string, data: any): Promise<T> => {
  return offlineAPI.put<T>(url, data);
};

export const offlineDeleteRequest = async <T>(url: string): Promise<T> => {
  return offlineAPI.delete<T>(url);
};

export const offlinePatch = async <T>(url: string, data: any): Promise<T> => {
  return offlineAPI.patch<T>(url, data);
};
