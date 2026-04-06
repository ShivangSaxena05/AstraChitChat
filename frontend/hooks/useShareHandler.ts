import { useCallback, useRef, useState } from 'react';
import { post } from '@/services/api';

interface UseShareHandlerOptions {
  postId: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

/**
 * useShareHandler
 * 
 * Implements fire-and-forget share tracking:
 * 1. On click: immediately increment count (optimistic)
 * 2. Fire async POST /posts/:id/share (no retry needed for shares)
 * 3. If request fails: silently retry once or do nothing
 * 4. Shares are less critical than likes, so lossy behavior is acceptable
 * 
 * @param options Configuration
 * @returns Hook interface with shareCount and trackShare
 */
export function useShareHandler({
  postId,
  onError,
  onSuccess,
}: UseShareHandlerOptions) {
  const [shareCount, setShareCount] = useState(0);
  const retryCountRef = useRef<{ [key: string]: number }>({});

  const trackShare = useCallback(() => {
    // Increment locally immediately (optimistic)
    setShareCount((prev) => prev + 1);

    // Fire-and-forget API call with single retry
    post(`/posts/${postId}/share`, {})
      .then(() => {
        onSuccess?.('Post shared successfully');
      })
      .catch((error) => {
        // For shares, we can retry once or silently fail
        // Since shares are less critical, we'll just log the error
        console.error('[Share] API call failed:', error?.message);
        
        // Optional: retry once
        const retryKey = `${postId}_share`;
        const retryCount = retryCountRef.current[retryKey] || 0;
        
        if (retryCount < 1) {
          retryCountRef.current[retryKey] = retryCount + 1;
          
          // Retry after a short delay
          setTimeout(() => {
            post(`/posts/${postId}/share`, {})
              .catch((retryError) => {
                console.error('[Share] Retry failed:', retryError?.message);
                // Silently fail after retry
              });
          }, 1000);
        }
      });
  }, [postId, onError, onSuccess]);

  return {
    shareCount,
    trackShare,
  };
}
