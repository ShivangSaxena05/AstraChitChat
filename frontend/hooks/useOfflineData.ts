import { useState, useEffect, useCallback, useRef } from 'react';
import offlineAPI from '@/services/offlineAPI';
import offlineStorage, { CACHE_KEYS } from '@/services/offlineStorage';
import { useNetworkStatus } from '@/contexts/NetworkContext';

interface UseOfflineDataOptions {
  cacheKey?: string;
  cacheTTL?: number;
  enableCache?: boolean;
  enableQueue?: boolean;
  onSyncStart?: () => void;
  onSyncEnd?: (result: { successful: number; failed: number }) => void;
}

interface UseOfflineDataResult<T> {
  data: T | null;
  loading: boolean;
  error: any;
  isFromCache: boolean;
  isSyncing: boolean;
  refresh: () => Promise<void>;
  syncQueue: () => Promise<void>;
}

/**
 * Hook for managing data with offline support
 * Automatically caches data and provides graceful degradation
 */
export const useOfflineData = <T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = [],
  options: UseOfflineDataOptions = {}
): UseOfflineDataResult<T> => {
  const { enableCache = true, cacheKey, cacheTTL, onSyncStart, onSyncEnd } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isOnline } = useNetworkStatus();
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      // Try to fetch fresh data
      const freshData = await fetchFn();
      
      if (isMounted.current) {
        setData(freshData);
        setIsFromCache(false);
        
        // Update cache
        if (enableCache && cacheKey) {
          await offlineStorage.saveToCache(cacheKey, freshData, cacheTTL);
        }
      }
    } catch (err: any) {
      console.error('[useOfflineData] Error fetching data:', err);
      
      // Try to use cached data
      if (enableCache && cacheKey && (err.isOffline || err.type === 'NETWORK_ERROR')) {
        try {
          const cachedData = await offlineStorage.getFromCache<T>(cacheKey);
          if (cachedData && isMounted.current) {
            setData(cachedData);
            setIsFromCache(true);
            setError(null); // Don't show error if cache is available
            return;
          }
        } catch (cacheErr) {
          console.error('[useOfflineData] Error reading cache:', cacheErr);
        }
      }

      if (isMounted.current) {
        setError(err);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [fetchFn, enableCache, cacheKey, cacheTTL]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadData();
  }, dependencies);

  // Auto-sync queue when coming back online
  useEffect(() => {
    if (isOnline && !isSyncing) {
      syncQueue();
    }
  }, [isOnline]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const syncQueue = useCallback(async () => {
    try {
      setIsSyncing(true);
      onSyncStart?.();

      const result = await offlineAPI.syncQueue();
      
      onSyncEnd?.(result);
      
      if (result.successful > 0) {
        // Refresh data after sync
        await loadData();
      }
    } catch (err) {
      console.error('[useOfflineData] Error syncing queue:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [loadData, onSyncStart, onSyncEnd]);

  return {
    data,
    loading,
    error,
    isFromCache,
    isSyncing,
    refresh,
    syncQueue,
  };
};

/**
 * Hook for managing mutations (POST, PUT, DELETE) with offline support
 */
interface UseMutationOptions {
  enableQueue?: boolean;
  cacheKeyToInvalidate?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

interface UseMutationResult<T> {
  execute: (data?: any) => Promise<T | null>;
  loading: boolean;
  error: any;
  success: boolean;
  isQueued: boolean;
}

export const useOfflineMutation = <T>(
  mutateFn: (data?: any) => Promise<T>,
  options: UseMutationOptions = {}
): UseMutationResult<T> => {
  const { enableQueue = true, cacheKeyToInvalidate, onSuccess, onError } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [success, setSuccess] = useState(false);
  const [isQueued, setIsQueued] = useState(false);

  const execute = useCallback(
    async (data?: any): Promise<T | null> => {
      setLoading(true);
      setError(null);
      setSuccess(false);
      setIsQueued(false);

      try {
        const result = await mutateFn(data);
        
        setSuccess(true);
        setLoading(false);
        onSuccess?.(result);

        // Invalidate cache if needed
        if (cacheKeyToInvalidate) {
          await offlineStorage.clearCache(cacheKeyToInvalidate);
        }

        return result;
      } catch (err: any) {
        console.error('[useMutation] Error:', err);
        
        // Check if request was queued
        if (err.queued) {
          setIsQueued(true);
          setSuccess(true); // Consider queued as success
          setLoading(false);
          return null;
        }

        setError(err);
        setLoading(false);
        onError?.(err);

        return null;
      }
    },
    [mutateFn, cacheKeyToInvalidate, onSuccess, onError]
  );

  return {
    execute,
    loading,
    error,
    success,
    isQueued,
  };
};

/**
 * Hook to track offline queue size
 */
export const useQueueSize = () => {
  const [queueSize, setQueueSize] = useState(0);
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    const checkQueueSize = async () => {
      const size = await offlineAPI.getQueueSize();
      setQueueSize(size);
    };

    checkQueueSize();

    // Check every 5 seconds
    const interval = setInterval(checkQueueSize, 5000);

    return () => clearInterval(interval);
  }, []);

  return { queueSize, hasQueue: queueSize > 0, isOnline };
};
