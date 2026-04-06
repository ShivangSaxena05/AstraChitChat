import { useCallback, useState } from 'react';
import { post as apiPost, get as apiGet } from '@/services/api';

export interface Comment {
  _id: string;
  text: string;
  createdAt: string;
  user: {
    _id: string;
    username: string;
    profilePicture?: string;
  };
}

export interface PendingComment extends Comment {
  _id: string; // Temporary ID
  status: 'sending' | 'failed';
}

interface UseCommentHandlerOptions {
  postId: string;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
  currentUserId?: string;
  currentUsername?: string;
  currentUserAvatar?: string;
}

/**
 * useCommentHandler
 * 
 * Implements optimistic comment submission with local pending state:
 * 1. On submit: immediately append with tempId and "sending..." indicator
 * 2. API call in background
 * 3. On success: replace tempId with real DB id, remove "sending..."
 * 4. On failure: mark with "failed to send" + retry button (don't remove silently)
 * 5. Retry failed comments without re-creating duplicates
 * 
 * @param options Configuration
 * @returns Hook interface with comments, submit, retry, delete, fetch operations
 */
export function useCommentHandler({
  postId,
  onError,
  onSuccess,
  currentUserId = 'current_user',
  currentUsername = 'You',
  currentUserAvatar,
}: UseCommentHandlerOptions) {
  const [comments, setComments] = useState<(Comment | PendingComment)[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch comments — only once per mount to avoid duplicate API calls
  const fetchComments = useCallback(async () => {
    if (hasFetched) return; // Only fetch once

    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await apiGet(`/posts/${postId}/comments`);
      const commentsList = Array.isArray(res?.comments) ? res.comments : [];
      setComments(commentsList);
      setCommentCount(commentsList.length);
      setHasFetched(true);
    } catch (err: any) {
      const errorMsg = 'Could not load comments';
      setFetchError(errorMsg);
      setComments([]);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [postId, hasFetched, onError]);

  // Submit comment with optimistic update — do NOT wait for API
  const submitComment = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const tempId = `temp_${Date.now()}`;
      const now = new Date().toISOString();

      // Optimistic update: add to list immediately with "sending..." indicator
      const pendingComment: PendingComment = {
        _id: tempId,
        text: trimmed,
        createdAt: now,
        status: 'sending',
        user: {
          _id: currentUserId,
          username: currentUsername,
          profilePicture: currentUserAvatar,
        },
      };

      setComments((prev) => [pendingComment, ...prev]);
      setCommentCount((prev) => prev + 1);
      setInputText('');
      setShowComments(true);
      setHasFetched(true);

      // Fire-and-forget API call in background
      try {
        const res = await apiPost(`/posts/${postId}/comments`, { text: trimmed });

        if (res?.comment) {
          // Success: replace temp comment with real one
          setComments((prev) =>
            prev.map((c) => (c._id === tempId ? res.comment : c))
          );
          onSuccess?.('Comment posted');
        }
      } catch (error: any) {
        // Failure: mark comment as failed with retry button (don't remove silently)
        const errorMsg = error?.message || 'Failed to post comment';
        setComments((prev) =>
          prev.map((c) =>
            c._id === tempId
              ? { ...c, status: 'failed' }
              : c
          )
        );
        onError?.(errorMsg);
        console.error('Failed to post comment:', errorMsg);
      }
    },
    [postId, currentUserId, currentUsername, currentUserAvatar, onError, onSuccess]
  );

  // Retry failed comment — update status back to sending
  const retryComment = useCallback(
    async (commentId: string, text: string) => {
      // Mark as retrying (change status back to sending)
      setComments((prev) =>
        prev.map((c) =>
          c._id === commentId
            ? { ...c, status: 'sending' }
            : c
        )
      );

      try {
        const res = await apiPost(`/posts/${postId}/comments`, { text });
        if (res?.comment) {
          // Success: replace with real comment
          setComments((prev) =>
            prev.map((c) => (c._id === commentId ? res.comment : c))
          );
          onSuccess?.('Comment posted');
        }
      } catch (error: any) {
        // Still failed: mark as failed again
        const errorMsg = error?.message || 'Failed to post comment';
        setComments((prev) =>
          prev.map((c) =>
            c._id === commentId
              ? { ...c, status: 'failed' }
              : c
          )
        );
        onError?.(errorMsg);
        console.error('Failed to retry comment:', errorMsg);
      }
    },
    [postId, onError, onSuccess]
  );

  // Delete comment — optimistic delete, rollback on failure
  const deleteComment = useCallback(
    async (commentId: string) => {
      // Store original comment for rollback
      const originalComments = comments;
      
      // Optimistic delete
      setComments((prev) => prev.filter((c) => c._id !== commentId));
      setCommentCount((prev) => Math.max(0, prev - 1));

      try {
        await apiPost(`/posts/${postId}/comments/${commentId}/delete`, {});
        onSuccess?.('Comment deleted');
      } catch (error: any) {
        // Rollback on failure
        setComments(originalComments);
        setCommentCount(originalComments.length);
        const errorMsg = error?.message || 'Failed to delete comment';
        onError?.(errorMsg);
        console.error('Failed to delete comment:', errorMsg);
      }
    },
    [postId, comments, onError, onSuccess]
  );

  return {
    comments,
    commentCount,
    showComments,
    setShowComments,
    showInput,
    setShowInput,
    inputText,
    setInputText,
    isLoading,
    hasFetched,
    fetchError,
    fetchComments,
    submitComment,
    retryComment,
    deleteComment,
  };
}
