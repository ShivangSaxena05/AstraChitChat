/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Post Data Helpers - Safe Access Layer for Frontend
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Safely extract and transform post display data with comprehensive null checks
 * - Works with explore page and feed posts
 * - All functions include type guards and fallbacks
 * - Prevents null crashes when displaying posts
 * - No external dependencies - pure TypeScript utilities
 */

/**
 * Post interface from backend response
 */
export interface Post {
  _id: string;
  author: {
    _id: string;
    username?: string;
    name?: string;
    profilePicture?: string;
  };
  caption?: string;
  hashtags?: string[];
  visibility?: string;
  location?: string | null;
  media: Array<{
    public_id?: string;
    secure_url?: string;
    resource_type?: 'image' | 'video';
    format?: string;
    version?: number;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    thumbnail_url?: string;
  }>;
  primaryMedia?: {
    secure_url?: string;
    resource_type?: string;
  };
  mediaUrl?: string;
  secure_url?: string;
  resource_type?: string;
  likes?: number;
  likesCount?: number;
  comments?: number;
  commentsCount?: number;
  shares?: number;
  sharesCount?: number;
  savedCount?: number;
  viewsCount?: number;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  isLiked?: boolean;
}

/**
 * ✅ SAFE: Get primary image URL for post
 * 
 * Works with:
 * - Backend's primaryMedia optimization
 * - Full media array (uses first item)
 * - mediaUrl/secure_url direct access
 * 
 * Always returns a valid HTTP(S) URL or null
 * 
 * @param post - Post object from API
 * @returns Image URL (HTTPS) or null if not available
 */
export function getPostImageUrl(post: Post | null | undefined): string | null {
  if (!post) return null;

  // Try primaryMedia first (backend optimization)
  if (post.primaryMedia?.secure_url && isValidImageUrl(post.primaryMedia.secure_url)) {
    return ensureHttps(post.primaryMedia.secure_url);
  }

  // Try direct mediaUrl/secure_url
  if (post.mediaUrl && isValidImageUrl(post.mediaUrl)) {
    return ensureHttps(post.mediaUrl);
  }

  if (post.secure_url && isValidImageUrl(post.secure_url)) {
    return ensureHttps(post.secure_url);
  }

  // Try first media item
  if (Array.isArray(post.media) && post.media.length > 0) {
    const firstMedia = post.media[0];
    if (firstMedia?.secure_url && isValidImageUrl(firstMedia.secure_url)) {
      return ensureHttps(firstMedia.secure_url);
    }
  }

  return null;
}

/**
 * ✅ SAFE: Get video thumbnail or fallback to image
 * 
 * @param post - Post object
 * @returns Thumbnail URL or image URL or placeholder
 */
export function getPostThumbnailUrl(post: Post | null | undefined): string | null {
  if (!post || !Array.isArray(post.media) || post.media.length === 0) {
    return null;
  }

  const firstMedia = post.media[0];

  // For videos, try thumbnail first
  if (firstMedia?.resource_type === 'video' && firstMedia?.thumbnail_url) {
    if (isValidImageUrl(firstMedia.thumbnail_url)) {
      return ensureHttps(firstMedia.thumbnail_url);
    }
  }

  // Fallback to regular image URL
  return getPostImageUrl(post);
}

/**
 * ✅ SAFE: Get post media type (image or video)
 * 
 * @param post - Post object
 * @returns 'image' | 'video' | 'text'
 */
export function getPostMediaType(post: Post | null | undefined): 'image' | 'video' | 'text' {
  if (!post) return 'image';

  // Check primaryMedia
  if (post.primaryMedia?.resource_type === 'video') return 'video';
  if (post.resource_type === 'video') return 'video';

  // Check first media item
  if (Array.isArray(post.media) && post.media.length > 0) {
    if (post.media[0]?.resource_type === 'video') return 'video';
  }

  // No media means text-only
  if (!post.mediaUrl && !post.secure_url && (!Array.isArray(post.media) || post.media.length === 0)) {
    return 'text';
  }

  return 'image';
}

/**
 * ✅ SAFE: Get post caption/title for display
 * 
 * @param post - Post object
 * @returns Caption text or placeholder
 */
export function getPostCaption(post: Post | null | undefined): string {
  if (!post) return '';

  const caption = post.caption?.trim?.();
  if (caption && caption.length > 0) {
    return caption;
  }

  return '';
}

/**
 * ✅ SAFE: Get formatted caption preview (truncated)
 * 
 * @param post - Post object
 * @param maxLength - Maximum length (default: 100)
 * @returns Formatted caption preview
 */
export function getPostCaptionPreview(post: Post | null | undefined, maxLength = 100): string {
  const caption = getPostCaption(post);

  if (caption.length === 0) return '';
  if (caption.length > maxLength) {
    return caption.substring(0, maxLength) + '...';
  }

  return caption;
}

/**
 * ✅ SAFE: Get post author display info
 * 
 * @param post - Post object
 * @returns Author info or defaults
 */
export function getPostAuthor(post: Post | null | undefined) {
  if (!post?.author) {
    return {
      _id: '',
      username: 'Unknown User',
      name: 'Unknown',
      profilePicture: '',
    };
  }

  return {
    _id: post.author._id || '',
    username: post.author.username || 'Unknown',
    name: post.author.name || post.author.username || 'Unknown',
    profilePicture: post.author.profilePicture || '',
  };
}

/**
 * ✅ SAFE: Get author profile picture with fallback
 * 
 * @param post - Post object
 * @returns Profile picture URL or null
 */
export function getPostAuthorAvatar(post: Post | null | undefined): string | null {
  if (!post?.author?.profilePicture) return null;

  if (isValidImageUrl(post.author.profilePicture)) {
    return ensureHttps(post.author.profilePicture);
  }

  return null;
}

/**
 * ✅ SAFE: Get post stats (likes, comments, shares)
 * 
 * @param post - Post object
 * @returns Stats object with safe counts
 */
export function getPostStats(post: Post | null | undefined) {
  if (!post) {
    return {
      likes: 0,
      comments: 0,
      shares: 0,
      saved: 0,
      views: 0,
    };
  }

  return {
    likes: Math.max(post.likes ?? post.likesCount ?? 0, 0),
    comments: Math.max(post.comments ?? post.commentsCount ?? 0, 0),
    shares: Math.max(post.shares ?? post.sharesCount ?? 0, 0),
    saved: Math.max(post.savedCount ?? 0, 0),
    views: Math.max(post.viewsCount ?? 0, 0),
  };
}

/**
 * ✅ SAFE: Get formatted stats for display
 * 
 * Examples: "1.2M likes", "234 comments"
 * 
 * @param post - Post object
 * @returns Formatted stats object
 */
export function getFormattedPostStats(post: Post | null | undefined) {
  const stats = getPostStats(post);

  const formatCount = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return {
    likes: formatCount(stats.likes),
    comments: formatCount(stats.comments),
    shares: formatCount(stats.shares),
    saved: formatCount(stats.saved),
    views: formatCount(stats.views),
  };
}

/**
 * ✅ SAFE: Get formatted time ago for display
 * 
 * Examples: "2m ago", "1h ago", "3 days ago"
 * 
 * @param post - Post object
 * @returns Formatted relative time or empty string
 */
export function getPostTimeAgo(post: Post | null | undefined): string {
  const dateString = post?.createdAt;
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 0) return 'now';
    if (diffSec < 60) return 'now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * ✅ SAFE: Get all media items with validation
 * 
 * Validates each media item for proper URLs
 * 
 * @param post - Post object
 * @returns Array of valid media items
 */
export function getPostAllMedia(post: Post | null | undefined) {
  if (!post || !Array.isArray(post.media)) {
    return [];
  }

  return post.media
    .filter(m => m && typeof m === 'object')
    .filter(m => m.secure_url && isValidImageUrl(m.secure_url))
    .map(m => ({
      url: ensureHttps(m.secure_url!),
      type: m.resource_type || 'image',
      public_id: m.public_id || '',
    }));
}

/**
 * ✅ SAFE: Get formatted display info for post (combines everything)
 * 
 * @param post - Post object
 * @returns Formatted display object
 */
export function formatPostForDisplay(post: Post | null | undefined) {
  if (!post) {
    return {
      imageUrl: null,
      mediaType: 'text' as const,
      caption: '',
      author: getPostAuthor(null),
      stats: getPostStats(null),
      timeAgo: '',
      isVideo: false,
    };
  }

  const mediaType = getPostMediaType(post);

  return {
    imageUrl: getPostImageUrl(post),
    mediaType,
    caption: getPostCaption(post),
    captionPreview: getPostCaptionPreview(post),
    author: getPostAuthor(post),
    authorAvatar: getPostAuthorAvatar(post),
    stats: getPostStats(post),
    formattedStats: getFormattedPostStats(post),
    timeAgo: getPostTimeAgo(post),
    isVideo: mediaType === 'video',
    isTextOnly: mediaType === 'text',
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE UTILITY FUNCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Check if a URL is a valid image/video URL
 */
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Ensure URL uses HTTPS
 */
function ensureHttps(url: string): string {
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:');
  return url;
}
