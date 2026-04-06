import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
}

export interface QueuedRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const CACHE_PREFIX = 'astra_cache_';
const QUEUE_PREFIX = 'astra_queue_';
const QUEUE_LIST_KEY = 'astra_queue_list';
const SYNC_STATUS_KEY = 'astra_sync_status';

// Default TTL: 1 hour for most data
const DEFAULT_TTL = 60 * 60 * 1000;

// Cache keys for different data types
export const CACHE_KEYS = {
  CHATS: 'chats',
  MESSAGES: (chatId: string) => `messages_${chatId}`,
  POSTS: 'posts',
  PROFILE: (userId: string) => `profile_${userId}`,
  FOLLOWERS: (userId: string) => `followers_${userId}`,
  FOLLOWING: (userId: string) => `following_${userId}`,
  SEARCH_RESULTS: (query: string) => `search_${query}`,
  USER_STATS: 'user_stats',
  FLICKS: 'flicks',
  EXPLORE: 'explore',
} as const;

class OfflineStorage {
  /**
   * Save data to cache with optional TTL
   */
  async saveToCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      console.error('[OfflineStorage] Error saving to cache:', error);
    }
  }

  /**
   * Retrieve data from cache
   */
  async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      const item = await AsyncStorage.getItem(cacheKey);
      
      if (!item) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(item);
      
      // Check if cache has expired
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        await AsyncStorage.removeItem(cacheKey);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('[OfflineStorage] Error reading from cache:', error);
      return null;
    }
  }

  /**
   * Clear specific cache entry
   */
  async clearCache(key: string): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('[OfflineStorage] Error clearing cache:', error);
    }
  }

  /**
   * Clear all cache entries
   */
  async clearAllCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('[OfflineStorage] Error clearing all cache:', error);
    }
  }

  /**
   * Add request to offline queue
   */
  async addToQueue(request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    try {
      const id = `${Date.now()}_${Math.random()}`;
      const queuedRequest: QueuedRequest = {
        ...request,
        id,
        timestamp: Date.now(),
        retries: 0,
      };

      const queueKey = `${QUEUE_PREFIX}${id}`;
      await AsyncStorage.setItem(queueKey, JSON.stringify(queuedRequest));

      // Add to queue list for tracking
      const queueList = await this.getQueueList();
      queueList.push(id);
      await AsyncStorage.setItem(QUEUE_LIST_KEY, JSON.stringify(queueList));

      return id;
    } catch (error) {
      console.error('[OfflineStorage] Error adding to queue:', error);
      throw error;
    }
  }

  /**
   * Get all queued requests
   */
  async getQueue(): Promise<QueuedRequest[]> {
    try {
      const queueList = await this.getQueueList();
      const requests: QueuedRequest[] = [];

      for (const id of queueList) {
        const queueKey = `${QUEUE_PREFIX}${id}`;
        const item = await AsyncStorage.getItem(queueKey);
        if (item) {
          requests.push(JSON.parse(item));
        }
      }

      return requests.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('[OfflineStorage] Error getting queue:', error);
      return [];
    }
  }

  /**
   * Remove request from queue
   */
  async removeFromQueue(requestId: string): Promise<void> {
    try {
      const queueKey = `${QUEUE_PREFIX}${requestId}`;
      await AsyncStorage.removeItem(queueKey);

      const queueList = await this.getQueueList();
      const updatedList = queueList.filter(id => id !== requestId);
      await AsyncStorage.setItem(QUEUE_LIST_KEY, JSON.stringify(updatedList));
    } catch (error) {
      console.error('[OfflineStorage] Error removing from queue:', error);
    }
  }

  /**
   * Update request retry count
   */
  async updateRequestRetries(requestId: string, retries: number): Promise<void> {
    try {
      const queueKey = `${QUEUE_PREFIX}${requestId}`;
      const item = await AsyncStorage.getItem(queueKey);
      if (item) {
        const request: QueuedRequest = JSON.parse(item);
        request.retries = retries;
        await AsyncStorage.setItem(queueKey, JSON.stringify(request));
      }
    } catch (error) {
      console.error('[OfflineStorage] Error updating request retries:', error);
    }
  }

  /**
   * Clear all queued requests
   */
  async clearQueue(): Promise<void> {
    try {
      const queueList = await this.getQueueList();
      for (const id of queueList) {
        const queueKey = `${QUEUE_PREFIX}${id}`;
        await AsyncStorage.removeItem(queueKey);
      }
      await AsyncStorage.removeItem(QUEUE_LIST_KEY);
    } catch (error) {
      console.error('[OfflineStorage] Error clearing queue:', error);
    }
  }

  /**
   * Get queue list
   */
  private async getQueueList(): Promise<string[]> {
    try {
      const item = await AsyncStorage.getItem(QUEUE_LIST_KEY);
      return item ? JSON.parse(item) : [];
    } catch (error) {
      console.error('[OfflineStorage] Error getting queue list:', error);
      return [];
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{ isSyncing: boolean; lastSync: number }> {
    try {
      const item = await AsyncStorage.getItem(SYNC_STATUS_KEY);
      if (item) {
        return JSON.parse(item);
      }
      return { isSyncing: false, lastSync: 0 };
    } catch (error) {
      console.error('[OfflineStorage] Error getting sync status:', error);
      return { isSyncing: false, lastSync: 0 };
    }
  }

  /**
   * Set sync status
   */
  async setSyncStatus(isSyncing: boolean): Promise<void> {
    try {
      const status = {
        isSyncing,
        lastSync: isSyncing ? Date.now() : (await this.getSyncStatus()).lastSync,
      };
      await AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('[OfflineStorage] Error setting sync status:', error);
    }
  }

  /**
   * Get storage usage stats
   */
  async getStorageStats(): Promise<{ cacheCount: number; queueCount: number }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      const queueKeys = keys.filter(key => key.startsWith(QUEUE_PREFIX));
      return {
        cacheCount: cacheKeys.length,
        queueCount: queueKeys.length,
      };
    } catch (error) {
      console.error('[OfflineStorage] Error getting storage stats:', error);
      return { cacheCount: 0, queueCount: 0 };
    }
  }
}

export default new OfflineStorage();
