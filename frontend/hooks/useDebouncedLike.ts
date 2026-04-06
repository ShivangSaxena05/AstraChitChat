import { useCallback, useRef, useState, useEffect } from 'react';
import { post, get as apiGet } from '@/services/api';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface UseDebouncedLikeOptions {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  debounceMs?: number;
  onError?: (error: string) => void;
}

interface PreviousState {
  liked: boolean;
  count: number;
}

/**
 * useDebouncedLike
 * 
 * Implements optimistic like/unlike with debounced API calls:
 * 1. On component mount: fetch actual like status from API
 * 2. On click: immediately toggle UI + increment/decrement count (optimistic)
 * 3. Mark as "pending"
 * 4. Debounce by 300ms — if user clicks rapidly, collapse to final state
 * 5. On success: sync count from DB (prevent optimistic drift)
 * 6. On error: rollback UI to previous state and show toast
 * 
 * @param options Configuration
 * @returns Hook interface with isLiked, likeCount, handleLike, cleanup
 */
export function useDebouncedLike({
  postId,
  initialLiked,
  initialCount,
  debounceMs = 300,
  onError,
}: UseDebouncedLikeOptions) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  // Store previous state for rollback on failure
  const previousStateRef = useRef<PreviousState>({
    liked: initialLiked,
    count: initialCount,
  });

  // Track pending state
  const pendingRef = useRef(false);

  // Debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the final desired state
  const desiredStateRef = useRef({
    liked: initialLiked,
    count: initialCount,
  });

  // Fetch actual like status on mount
  useEffect(() => {
    const fetchLikeStatus = async () => {
      try {
        const response = await apiGet(`/posts/${postId}/like/check`);
        if (response) {
          setIsLiked(response.isLiked ?? initialLiked);
          setLikeCount(response.count ?? initialCount);
          previousStateRef.current = { 
            liked: response.isLiked ?? initialLiked, 
            count: response.count ?? initialCount 
          };
        }
      } catch (error) {
        console.error('[useDebouncedLike] Failed to fetch like status:', error);
        // Fall back to initial values
      }
    };

    fetchLikeStatus();
  }, [postId, initialLiked, initialCount]);

  const handleLike = useCallback(async () => {
    // Store previous state before optimistic update
    previousStateRef.current = { liked: isLiked, count: likeCount };

    // Calculate next state
    const nextLiked = !isLiked;
    const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1);

    // Update UI immediately (optimistic)
    setIsLiked(nextLiked);
    setLikeCount(nextCount);
    setIsLoading(true);
    pendingRef.current = true;

    // Store desired state
    desiredStateRef.current = { liked: nextLiked, count: nextCount };

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer — collapse rapid clicks to single request
    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Make API call with the final desired state
        const response = await post(`/posts/${postId}/like`, {});

        // Sync with server response count to prevent optimistic drift
        if (response?.count !== undefined) {
          setLikeCount(response.count);
        }

        setIsLoading(false);
        pendingRef.current = false;
      } catch (error: any) {
        // Rollback to previous state on failure
        setIsLiked(previousStateRef.current.liked);
        setLikeCount(previousStateRef.current.count);
        setIsLoading(false);
        pendingRef.current = false;

        // Show error to user
        const errorMsg = error?.message || 'Failed to update like';
        onError?.(errorMsg);
        
        console.error('Failed to update like:', errorMsg);
      }
    }, debounceMs);
  }, [isLiked, likeCount, postId, debounceMs, onError]);

  const cleanup = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    isLiked,
    likeCount,
    isLoading,
    isPending: pendingRef.current,
    handleLike,
    cleanup,
  };
}
