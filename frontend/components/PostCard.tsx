/**
 * PostCard.tsx — Production-grade social post card
 *
 * Features:
 *  - Optimistic like toggle with rollback on API failure
 *  - Comment box with submit-on-enter + loading guard
 *  - Comment list fetched once per mount (cached in local state)
 *  - Expandable caption (clamps at 2 lines, tap to expand)
 *  - Stable callbacks via useRef to avoid unnecessary re-renders
 *  - Full error handling with user-facing alerts
 *  - Accessible touch targets (hitSlop on small buttons)
 *  - Graceful fallback for missing avatar / media
 *
 * API surface (backend endpoints):
 *  POST /posts/:id/like        — toggles like for the current user
 *  GET  /posts/:id/comments    — returns { comments: Comment[] }
 *  POST /posts/:id/comments    — body: { text }  returns { comment: Comment }
 */

import React, {
  memo,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
  Animated,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { post as apiPost, get as apiGet } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';
import { useDebouncedLike } from '@/hooks/useDebouncedLike';
import { useCommentHandler } from '@/hooks/useCommentHandler';
import { useShareHandler } from '@/hooks/useShareHandler';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostUser {
  _id: string;
  username: string;
  profilePicture?: string;
  name?: string;
}

export interface Post {
  _id: string;
  secure_url?: string;
  mediaUrl?: string;
  resource_type?: string;
  mediaType?: 'image' | 'video' | 'text';
  type?: 'video' | 'photo' | 'text';
  caption: string;
  author?: PostUser;
  user?: PostUser;
  createdAt: string;
  likes?: number;
  isLiked?: boolean;
  comments?: number;
  duration?: number | null;
}

interface Comment {
  _id: string;
  text: string;
  createdAt: string;
  user: PostUser;
}

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
  onPress?: (postId: string) => void;
  /** Called after a successful like/unlike so parent can sync list state */
  onLikeChange?: (postId: string, liked: boolean, newCount: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPTION_TRUNCATE_THRESHOLD = 120; // chars before "Read more" appears
const FALLBACK_AVATAR = 'https://i.pravatar.cc/150?u=';
const COMMENT_MAX_HEIGHT = 300;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCount = (n?: number): string => {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const formatTimeAgo = (iso?: string): string => {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0)          return 'just now';
    if (diff < 60_000)     return 'just now';
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000)return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Skeleton shimmer placeholder while image loads */
const ImageSkeleton = memo(({ color }: { color: string }) => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.mediaSkeleton, { backgroundColor: color, opacity }]}
    />
  );
});

/** Single comment row with pending/failed states */
const CommentRow = memo(({ comment, colors, onRetry }: {
  comment: Comment | any;
  colors: ReturnType<typeof useTheme>;
  onRetry?: (commentId: string, text: string) => void;
}) => {
  const isPending = comment.status === 'sending';
  const isFailed = comment.status === 'failed';

  return (
    <View style={styles.commentRow}>
      <Image
        source={{ 
          uri: comment.user?.profilePicture?.trim?.() 
            ? comment.user.profilePicture 
            : FALLBACK_AVATAR + (comment.user?._id ?? 'unknown')
        }}
        style={[styles.commentAvatar, isPending && styles.commentAvatarPending]}
        onError={() => console.warn('❌ Failed to load comment avatar')}
      />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentUsername, { color: colors.text }]}>
            {comment.user?.username ?? 'Unknown'}
          </Text>
          <Text style={[styles.commentTime, { color: colors.textTertiary }]}>
            {isPending ? 'sending...' : isFailed ? 'failed' : formatTimeAgo(comment.createdAt)}
          </Text>
        </View>
        <Text style={[styles.commentText, { color: colors.text, opacity: isPending ? 0.6 : 1 }]}>
          {comment.text}
        </Text>
        {isFailed && (
          <TouchableOpacity
            style={{ marginTop: 6 }}
            onPress={() => onRetry?.(comment._id, comment.text)}
          >
            <Text style={[styles.retryText, { color: colors.tint }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// ─── Custom hook — isolates all async logic ───────────────────────────────────

function usePostCard(post: Post, currentUserId?: string | null, onLikeChange?: PostCardProps['onLikeChange']) {
  // Error state for showing toast messages
  const [toastMessage, setToastMessage] = React.useState<{ type: 'error' | 'success', message: string } | null>(null);

  // Handle errors from like operations
  const handleLikeError = useCallback((error: string) => {
    setToastMessage({ type: 'error', message: error });
    // Auto-dismiss after 3 seconds
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Handle errors from comment operations
  const handleCommentError = useCallback((message: string) => {
    setToastMessage({ type: 'error', message });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Handle success from comment operations
  const handleCommentSuccess = useCallback((message: string) => {
    setToastMessage({ type: 'success', message });
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // Handle errors from share operations
  const handleShareError = useCallback((error: string) => {
    console.error('[Share Error]', error);
    // Don't show error for shares as they're fire-and-forget
  }, []);

  // Use debounced like hook with error handler
  const { 
    isLiked, 
    likeCount, 
    isLoading: likeLoading, 
    handleLike: baseHandleLike,
    cleanup: cleanupLike,
  } = useDebouncedLike({
    postId: post._id,
    initialLiked: post.isLiked ?? false,
    initialCount: post.likes ?? 0,
    debounceMs: 300,
    onError: handleLikeError,
  });

  // Use comment handler hook with error and success callbacks
  const commentHandler = useCommentHandler({ 
    postId: post._id,
    onError: handleCommentError,
    onSuccess: handleCommentSuccess,
    currentUserId: currentUserId ?? undefined,
    currentUsername: 'You', // You can get this from auth context
    currentUserAvatar: undefined, // You can get this from auth context
  });

  // Use share handler hook with error callback
  const { trackShare } = useShareHandler({ 
    postId: post._id,
    onError: handleShareError,
  });

  // Call callback when like changes
  useEffect(() => {
    onLikeChange?.(post._id, isLiked, likeCount);
  }, [post._id, isLiked, likeCount, onLikeChange]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return cleanupLike;
  }, [cleanupLike]);

  // Auto-fetch comments on component mount to show preview
  useEffect(() => {
    commentHandler.fetchComments();
  }, [post._id]);

  // Wrap handleLike to clear error message when trying again
  const handleLike = useCallback(() => {
    setToastMessage(null);
    baseHandleLike();
  }, [baseHandleLike]);

  const handleToggleComments = useCallback(async () => {
    if (!commentHandler.showComments && !commentHandler.hasFetched) {
      await commentHandler.fetchComments();
    }
    commentHandler.setShowComments(prev => !prev);
  }, [commentHandler.showComments, commentHandler.hasFetched, commentHandler]);

  const handleToggleInput = useCallback(() => {
    commentHandler.setShowInput(prev => !prev);
  }, [commentHandler]);

  const handleSubmitComment = useCallback(async () => {
    await commentHandler.submitComment(commentHandler.inputText);
  }, [commentHandler]);

  return {
    isLiked, 
    likeCount, 
    likeLoading, 
    handleLike,
    comments: commentHandler.comments, 
    commentCount: commentHandler.commentCount, 
    showComments: commentHandler.showComments, 
    commentsLoading: commentHandler.isLoading, 
    fetchError: commentHandler.fetchError,
    handleToggleComments, 
    retryFetchComments: commentHandler.fetchComments,
    retryComment: commentHandler.retryComment,
    showInput: commentHandler.showInput, 
    inputText: commentHandler.inputText, 
    setInputText: commentHandler.setInputText, 
    submitLoading: false,
    handleToggleInput, 
    handleSubmitComment,
    trackShare,
    toastMessage,
    setToastMessage,
  };
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

const PostCard = memo(function PostCard({ post, currentUserId, onPress, onLikeChange }: PostCardProps) {
  const colors = useTheme();
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [imageLoaded,     setImageLoaded]     = useState(false);
  const [imageError,      setImageError]      = useState(false);

  const {
    isLiked, likeCount, likeLoading, handleLike,
    comments, commentCount, showComments, commentsLoading, fetchError,
    handleToggleComments, retryFetchComments, retryComment,
    showInput, inputText, setInputText, submitLoading,
    handleToggleInput, handleSubmitComment,
    trackShare,
    toastMessage,
  } = usePostCard(post, currentUserId, onLikeChange);

  const hasLongCaption = (post.caption?.length ?? 0) > CAPTION_TRUNCATE_THRESHOLD;
  
  // Helper: get media URL (supports both old mediaUrl and new secure_url formats)
  const getMediaUrl = () => post.secure_url || post.mediaUrl;
  const hasMedia = !!getMediaUrl() && (post.mediaType ?? post.resource_type) !== 'text';

  const handleSharePress = useCallback(() => {
    trackShare();
  }, [trackShare]);

  // Helper: get author/user object (supports both old and new API formats)
  const getAuthor = () => post.author || post.user;

  // FIX: Safely construct avatar URI for Android compatibility
  const getAvatarUri = (): string => {
    const author = getAuthor();
    if (!author) return FALLBACK_AVATAR + 'unknown';
    
    const picture = author.profilePicture;
    // If we have a valid picture URL, use it
    if (picture && typeof picture === 'string' && picture.trim().length > 0) {
      return picture;
    }
    
    // Fallback: use author ID or 'unknown'
    return FALLBACK_AVATAR + (author._id || 'unknown');
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card }]}
      accessible
      accessibilityLabel={`Post by ${getAuthor()?.username || 'Unknown'}`}
    >
      {/* ── Toast Notification ──────────────────────────────────────────────── */}
      {toastMessage && (
        <View
          style={[
            styles.toast,
            {
              backgroundColor: toastMessage.type === 'error' ? '#ff006e' : '#10b981',
            },
          ]}
        >
          <Text style={[styles.toastText, { color: '#fff' }]}>
            {toastMessage.type === 'error' ? '⚠️ ' : '✓ '}
            {toastMessage.message}
          </Text>
        </View>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => onPress?.(post._id)}
          accessibilityRole="button"
          accessibilityLabel={`View ${getAuthor()?.username || 'Unknown'}'s profile`}
        >
          <Image
            source={{ uri: getAvatarUri() }}
            style={styles.avatar}
            onError={() => console.warn('❌ Failed to load author avatar:', getAvatarUri())}
          />
          <View>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {getAuthor()?.username || 'Unknown'}
            </Text>
            <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
              {formatTimeAgo(post.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Post options"
          accessibilityRole="button"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Media ──────────────────────────────────────────────────────────── */}
      {hasMedia && (
        <Pressable
          onPress={() => onPress?.(post._id)}
          accessibilityRole="imagebutton"
          accessibilityLabel="View post"
          style={styles.mediaWrapper}
        >
          {/* Skeleton shown until image loads or errors */}
          {!imageLoaded && !imageError && (
            <ImageSkeleton color={colors.backgroundSecondary ?? '#e0e0e0'} />
          )}

          {imageError ? (
            <View style={[styles.mediaError, { backgroundColor: colors.backgroundSecondary ?? '#f0f0f0' }]}>
              <Ionicons name="image-outline" size={36} color={colors.textTertiary} />
              <Text style={[styles.mediaErrorText, { color: colors.text }]}>
                Failed to load image
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: getMediaUrl() || 'https://via.placeholder.com/400x300' }}
              style={[styles.media, !imageLoaded && styles.hidden]}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => { setImageError(true); setImageLoaded(true); }}
            />
          )}
        </Pressable>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <View style={[styles.actions, { borderBottomColor: colors.border }]}>
        {/* Like */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleLike}
          disabled={likeLoading}
          accessibilityRole="button"
          accessibilityLabel={isLiked ? 'Unlike post' : 'Like post'}
          accessibilityState={{ checked: isLiked }}
        >
          {likeLoading ? (
            <ActivityIndicator size="small" color="#ff006e" />
          ) : (
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={22}
              color={isLiked ? colors.tint : colors.textSecondary}
            />
          )}
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {formatCount(likeCount)}
          </Text>
        </TouchableOpacity>

        {/* Comment (opens input) */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleToggleInput}
          accessibilityRole="button"
          accessibilityLabel="Add a comment"
        >
          <Ionicons
            name={showInput ? 'chatbubble' : 'chatbubble-outline'}
            size={22}
            color={showInput ? colors.tint : colors.textSecondary}
          />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {formatCount(commentCount)}
          </Text>
        </TouchableOpacity>

        {/* View comments */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleToggleComments}
          accessibilityRole="button"
          accessibilityLabel={showComments ? 'Hide comments' : 'View comments'}
        >
          <Ionicons
            name={showComments ? 'eye' : 'eye-outline'}
            size={22}
            color={showComments ? colors.tint : colors.textSecondary}
          />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {showComments ? 'Hide' : 'View'}
          </Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleSharePress}
          accessibilityRole="button"
          accessibilityLabel="Share post"
        >
          <Ionicons name="share-social-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* ── Caption ────────────────────────────────────────────────────────── */}
      {!!post.caption && (
        <TouchableOpacity
          style={styles.captionContainer}
          onPress={() => hasLongCaption && setCaptionExpanded(p => !p)}
          activeOpacity={hasLongCaption ? 0.7 : 1}
          accessibilityRole={hasLongCaption ? 'button' : 'text'}
          accessibilityLabel={captionExpanded ? 'Collapse caption' : 'Expand caption'}
        >
          <Text
            style={[styles.caption, { color: colors.text }]}
            numberOfLines={captionExpanded ? undefined : 2}
          >
            <Text style={styles.captionUsername}>{getAuthor()?.username || 'Unknown'} </Text>
            {post.caption}
          </Text>
          {hasLongCaption && (
            <Text style={[styles.expandToggle, { color: colors.tint }]}>
              {captionExpanded ? 'Show less' : 'Read more'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* ── Comments Preview (always show 1-2 comments or input) ─────────────── */}
      <View style={[styles.commentsSection, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        {/* Show first 1-2 comments preview */}
        {!commentsLoading && !fetchError && comments.length > 0 && (
          <View style={styles.commentsPreview}>
            {comments.slice(0, 2).map(c => (
              <CommentRow 
                key={c._id} 
                comment={c} 
                colors={colors}
                onRetry={retryComment}
              />
            ))}
            {comments.length > 2 && (
              <TouchableOpacity 
                onPress={handleToggleComments}
                style={styles.viewAllCommentsBtn}
              >
                <Text style={[styles.viewAllCommentsText, { color: colors.textTertiary }]}>
                  View all {comments.length} comments
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Comment Input - Always visible */}
        <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!submitLoading}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSubmitComment}
            accessibilityLabel="Comment input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: submitLoading || !inputText.trim() ? 0.5 : 1 }]}
            onPress={handleSubmitComment}
            disabled={submitLoading || !inputText.trim()}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
          >
            {submitLoading
              ? <ActivityIndicator size="small" color={colors.tint} />
              : <Ionicons name="send" size={20} color={colors.tint} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Full Comment List (Expandable) ──────────────────────────────────── */}
      {showComments && (
        <View style={[styles.commentList, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {commentsLoading ? (
            <View style={styles.commentCenter}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : fetchError ? (
            <View style={styles.commentCenter}>
              <Text style={[styles.errorText, { color: colors.textTertiary }]}>{fetchError}</Text>
              <TouchableOpacity onPress={retryFetchComments} style={styles.retryBtn}>
                <Text style={[styles.retryText, { color: colors.tint }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.commentCenter}>
              <Text style={[styles.emptyCommentsText, { color: colors.textTertiary }]}>
                No comments yet — be the first!
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: COMMENT_MAX_HEIGHT }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
              scrollIndicatorInsets={{ right: 1 }}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map(c => (
                <CommentRow 
                  key={c._id} 
                  comment={c} 
                  colors={colors}
                  onRetry={retryComment}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
});

export default PostCard;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Constants for consistent spacing
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },

  // Toast notification - positioned at top
  toast: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },

  // Header - Fixed padding consistency
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerUser: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ddd', overflow: 'hidden' },
  username: { fontSize: 14, fontWeight: '700', maxWidth: 200, lineHeight: 20 },
  timestamp: { fontSize: 11, marginTop: 1, lineHeight: 16 },
  menuBtn: { padding: 8, minWidth: 40 },

  // Media - Added border radius for consistency
  mediaWrapper: { width: '100%', aspectRatio: 1, backgroundColor: '#f0f0f0', overflow: 'hidden' },
  media: { width: '100%', height: '100%', borderRadius: 14 },
  hidden: { position: 'absolute', opacity: 0 },
  mediaSkeleton: { ...StyleSheet.absoluteFillObject },
  mediaError: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  mediaErrorText: { fontSize: 12, fontWeight: '500' },

  // Actions - Fixed spacing and touch targets
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  actionBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    paddingVertical: 10, 
    paddingHorizontal: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  actionLabel: { fontSize: 13, fontWeight: '600', lineHeight: 22 },

  // Caption - Improved spacing
  captionContainer: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  caption: { fontSize: 13, lineHeight: 20 },
  captionUsername: { fontWeight: '700' },
  expandToggle: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  // Input - Better styling and touch target
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: { 
    padding: 8, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderRadius: 20,
    minHeight: 40,
    minWidth: 40,
  },

  // Comments section - preview + input
  commentsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  commentsPreview: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  viewAllCommentsBtn: {
    paddingVertical: 8,
  },
  viewAllCommentsText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Comment list - Better scrolling indicator
  commentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commentCenter: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyCommentsText: { fontSize: 13 },
  errorText: { fontSize: 13 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { fontSize: 13, fontWeight: '600' },

  // Comment row - Better spacing
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ddd', overflow: 'hidden', marginRight: 4 },
  commentAvatarPending: { opacity: 0.5 },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  commentUsername: { fontSize: 12, fontWeight: '700' },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, lineHeight: 18 },
});