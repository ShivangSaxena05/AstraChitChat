import { useState, useCallback, useEffect, useRef } from 'react';
import offlineAPI from '@/services/offlineAPI';
import offlineStorage, { CACHE_KEYS } from '@/services/offlineStorage';
import { useNetworkStatus } from '@/contexts/NetworkContext';

interface UseChatListOptions {
  onSyncStart?: () => void;
  onSyncEnd?: (result: { successful: number; failed: number }) => void;
}

/**
 * Hook for fetching chat list with offline support
 */
export const useChatList = (options: UseChatListOptions = {}) => {
  const [chats, setChats] = useState<any[]>([]);
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

  const fetchChats = useCallback(async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const data = await offlineAPI.get(
        '/chats',
        CACHE_KEYS.CHATS,
        60 * 60 * 1000 // 1 hour cache
      );
      
      if (isMounted.current) {
        setChats(data as any[]);
        setIsFromCache(false);
      }
    } catch (err: any) {
      console.error('[useChatList] Error fetching chats:', err);
      
      // Try to use cached data
      if (err.isOffline || err.type === 'NETWORK_ERROR') {
        try {
          const cachedChats = await offlineStorage.getFromCache(CACHE_KEYS.CHATS);
          if (cachedChats && isMounted.current) {
            setChats(cachedChats as any[]);
            setIsFromCache(true);
            setError(null);
            return;
          }
        } catch (cacheErr) {
          console.error('[useChatList] Error reading cache:', cacheErr);
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
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    if (isOnline && !isSyncing) {
      syncQueue();
    }
  }, [isOnline]);

  const syncQueue = useCallback(async () => {
    try {
      setIsSyncing(true);
      options.onSyncStart?.();

      const result = await offlineAPI.syncQueue();
      options.onSyncEnd?.(result);

      if (result.successful > 0) {
        await fetchChats();
      }
    } catch (err) {
      console.error('[useChatList] Error syncing queue:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchChats, options]);

  const sendMessage = useCallback(
    async (chatId: string, messageData: any) => {
      try {
        const response = await offlineAPI.post(
          `/chats/${chatId}/messages`,
          messageData
        );
        
        // Invalidate cache after successful send
        await offlineStorage.clearCache(CACHE_KEYS.MESSAGES(chatId));
        await offlineStorage.clearCache(CACHE_KEYS.CHATS);
        
        return response;
      } catch (err) {
        console.error('[useChatList] Error sending message:', err);
        throw err;
      }
    },
    []
  );

  return {
    chats,
    loading,
    error,
    isFromCache,
    isSyncing,
    refresh: fetchChats,
    sendMessage,
    syncQueue,
  };
};

/**
 * Hook for fetching posts with offline support
 */
export const usePostList = (options: UseChatListOptions = {}) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { isOnline } = useNetworkStatus();
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchPosts = useCallback(
    async (pageNum = 1, append = false) => {
      if (!isMounted.current) return;

      if (pageNum === 1) {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await offlineAPI.get(
          `/posts?page=${pageNum}&limit=20`,
          CACHE_KEYS.POSTS,
          60 * 60 * 1000 // 1 hour cache
        );
        
        if (isMounted.current) {
          const postsData = data as any;
          if (append) {
            setPosts(prev => [...prev, ...postsData.posts]);
          } else {
            setPosts(postsData.posts);
          }
          setPage(pageNum);
          setHasMore(postsData.hasMore);
          setIsFromCache(false);
        }
      } catch (err: any) {
        console.error('[usePostList] Error fetching posts:', err);
        
        // Try to use cached data
        if ((err.isOffline || err.type === 'NETWORK_ERROR') && pageNum === 1) {        try {
          const cachedPosts = await offlineStorage.getFromCache(CACHE_KEYS.POSTS);
          if (cachedPosts && isMounted.current) {
            setPosts(cachedPosts as any[]);
            setIsFromCache(true);
            setError(null);
            return;
          }
        } catch (cacheErr) {
          console.error('[usePostList] Error reading cache:', cacheErr);
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
    },
    []
  );

  useEffect(() => {
    fetchPosts(1, false);
  }, []);

  useEffect(() => {
    if (isOnline && !isSyncing) {
      syncQueue();
    }
  }, [isOnline]);

  const syncQueue = useCallback(async () => {
    try {
      setIsSyncing(true);
      options.onSyncStart?.();

      const result = await offlineAPI.syncQueue();
      options.onSyncEnd?.(result);

      if (result.successful > 0) {
        await fetchPosts(1, false);
      }
    } catch (err) {
      console.error('[usePostList] Error syncing queue:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchPosts, options]);

  const loadMore = useCallback(() => {
    if (hasMore && isOnline) {
      fetchPosts(page + 1, true);
    }
  }, [page, hasMore, isOnline, fetchPosts]);

  return {
    posts,
    loading,
    error,
    isFromCache,
    isSyncing,
    hasMore,
    page,
    refresh: () => fetchPosts(1, false),
    loadMore,
    syncQueue,
  };
};

/**
 * Hook for fetching user profile with offline support
 */
export const useUserProfile = (userId: string, options: UseChatListOptions = {}) => {
  const [profile, setProfile] = useState<any>(null);
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

  const fetchProfile = useCallback(async () => {
    if (!isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const data = await offlineAPI.get(
        `/users/${userId}/profile`,
        CACHE_KEYS.PROFILE(userId),
        30 * 60 * 1000 // 30 minutes cache
      );
      
      if (isMounted.current) {
        setProfile(data);
        setIsFromCache(false);
      }
    } catch (err: any) {
      console.error('[useUserProfile] Error fetching profile:', err);
      
      // Try to use cached data
      if (err.isOffline || err.type === 'NETWORK_ERROR') {
        try {
          const cachedProfile = await offlineStorage.getFromCache(CACHE_KEYS.PROFILE(userId));
          if (cachedProfile && isMounted.current) {
            setProfile(cachedProfile);
            setIsFromCache(true);
            setError(null);
            return;
          }
        } catch (cacheErr) {
          console.error('[useUserProfile] Error reading cache:', cacheErr);
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
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [userId, fetchProfile]);

  useEffect(() => {
    if (isOnline && !isSyncing) {
      syncQueue();
    }
  }, [isOnline]);

  const syncQueue = useCallback(async () => {
    try {
      setIsSyncing(true);
      options.onSyncStart?.();

      const result = await offlineAPI.syncQueue();
      options.onSyncEnd?.(result);

      if (result.successful > 0) {
        await fetchProfile();
      }
    } catch (err) {
      console.error('[useUserProfile] Error syncing queue:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchProfile, options]);

  return {
    profile,
    loading,
    error,
    isFromCache,
    isSyncing,
    refresh: fetchProfile,
    syncQueue,
  };
};
