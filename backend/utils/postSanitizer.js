/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Post Sanitizer Utility
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Normalize and sanitize post data before sending to frontend
 * - Ensures no null/undefined crashes on explore page
 * - Handles multiple media items (not just first)
 * - Validates all media URLs are proper HTTP(S)
 * - Provides consistent data structure
 * - Enriches posts with author info
 * - Provides sensible defaults for all fields
 * 
 * Usage:
 *   const sanitized = sanitizePostForResponse(post, userId);
 *   res.json(sanitized);
 */

const { applyUserDefaults } = require('./lazyDefaults');

/**
 * ✅ MAIN POST SANITIZER FUNCTION
 * 
 * Normalizes a post object for API response:
 * - Validates and fixes all media URLs
 * - Ensures author is populated with full user details
 * - Provides sensible defaults for all missing fields
 * - Handles both single and multiple media items
 * - Applies user defaults to author object
 * 
 * @param {Object} post - Post document (can be Mongoose document or plain object)
 * @param {String|ObjectId} userId - Current user ID (for future use: isLiked, etc.)
 * @returns {Object} Sanitized post object safe for frontend consumption
 */
function sanitizePostForResponse(post, userId) {
  if (!post) return null;

  // Convert to plain object if Mongoose document
  let postObj = post.toObject?.() || { ...post };

  // ✅ CRITICAL: Ensure basic structure
  if (!postObj._id) postObj._id = null;
  if (!postObj.createdAt) postObj.createdAt = new Date();
  if (!postObj.updatedAt) postObj.updatedAt = new Date();
  if (!postObj.caption) postObj.caption = '';
  if (!Array.isArray(postObj.hashtags)) postObj.hashtags = [];
  if (!postObj.visibility) postObj.visibility = 'public';
  if (!postObj.location) postObj.location = null;

  // ✅ Initialize counts
  const likesCount = postObj.likesCount ?? 0;
  const commentsCount = postObj.commentsCount ?? 0;
  const sharesCount = postObj.sharesCount ?? 0;
  const savedCount = postObj.savedCount ?? 0;
  const viewsCount = postObj.viewsCount ?? 0;

  // ✅ Normalize author
  let authorObj = null;
  if (postObj.author) {
    if (typeof postObj.author === 'object' && postObj.author._id) {
      // Author is populated object
      authorObj = applyUserDefaults(postObj.author);
    } else if (postObj.author.toString?.()) {
      // Author is just ObjectId - this shouldn't happen if properly populated
      console.warn(`[sanitizePostForResponse] Author not populated for post: ${postObj._id}`);
      authorObj = {
        _id: postObj.author,
        username: 'Unknown User',
        profilePicture: '',
        name: 'Unknown',
      };
    }
  }

  if (!authorObj) {
    authorObj = {
      _id: '',
      username: 'Unknown User',
      profilePicture: '',
      name: 'Unknown',
    };
  }

  // ✅ Normalize media array
  const normalizedMedia = normalizeMediaArray(postObj.media || []);

  // ✅ Get primary media for quick access
  const primaryMedia = normalizedMedia[0] || {
    public_id: '',
    secure_url: '',
    resource_type: 'image',
    format: '',
    version: 0,
  };

  // ✅ Build final sanitized response
  const sanitized = {
    _id: postObj._id,
    author: authorObj,
    caption: postObj.caption.trim(),
    hashtags: postObj.hashtags,
    visibility: postObj.visibility,
    location: postObj.location,
    
    // ✅ PRIMARY MEDIA (for quick display)
    media: normalizedMedia,
    primaryMedia: primaryMedia,  // First media item for easy access
    mediaUrl: primaryMedia.secure_url,  // Direct URL access
    secure_url: primaryMedia.secure_url,  // Cloudinary format
    resource_type: primaryMedia.resource_type,  // 'image' or 'video'
    
    // ✅ COUNTS
    likes: likesCount,
    likesCount: likesCount,
    comments: commentsCount,
    commentsCount: commentsCount,
    shares: sharesCount,
    sharesCount: sharesCount,
    savedCount: savedCount,
    viewsCount: viewsCount,
    
    // ✅ METADATA
    createdAt: postObj.createdAt,
    updatedAt: postObj.updatedAt,
    
    // ✅ FLAGS
    isDeleted: postObj.isDeleted ?? false,
    isLiked: false,  // Frontend will determine this from Like collection
  };

  return sanitized;
}

/**
 * ✅ BATCH SANITIZER
 * 
 * Sanitizes array of posts efficiently
 * 
 * @param {Array} posts - Array of post documents
 * @param {String|ObjectId} userId - Current user ID
 * @returns {Array} Array of sanitized posts
 */
function sanitizePostsForResponse(posts, userId) {
  if (!Array.isArray(posts)) return [];
  return posts.map(post => sanitizePostForResponse(post, userId)).filter(p => p !== null);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEDIA NORMALIZATION
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ✅ Normalize media array
 * 
 * Validates and fixes each media item:
 * - Ensures URLs are proper HTTP(S)
 * - Validates resource_type
 * - Provides sensible defaults
 * - Removes invalid items
 * 
 * @param {Array} mediaArray - Raw media array from post
 * @returns {Array} Normalized media array
 */
function normalizeMediaArray(mediaArray) {
  if (!Array.isArray(mediaArray) || mediaArray.length === 0) {
    return [];
  }

  return mediaArray
    .map((media, idx) => {
      if (!media || typeof media !== 'object') {
        console.warn(`[normalizeMediaArray] Invalid media at index ${idx}:`, media);
        return null;
      }

      // ✅ Validate and fix URL
      let secureUrl = media.secure_url || media.url || '';
      if (secureUrl && typeof secureUrl === 'string') {
        secureUrl = ensureHttps(secureUrl.trim());
      }
      if (!secureUrl || !isValidImageUrl(secureUrl)) {
        console.warn(`[normalizeMediaArray] Invalid media URL at index ${idx}:`, secureUrl);
        return null;
      }

      // ✅ Validate resource type
      const validResourceTypes = ['image', 'video', 'raw', 'auto'];
      let resourceType = media.resource_type || 'image';
      if (!validResourceTypes.includes(resourceType)) {
        resourceType = 'image';
      }

      return {
        public_id: media.public_id || '',
        secure_url: secureUrl,
        resource_type: resourceType,
        format: media.format || '',
        version: media.version || 0,
        width: media.width || null,
        height: media.height || null,
        duration: media.duration || null,
        size: media.size || null,
        thumbnail_url: media.thumbnail_url || '',
      };
    })
    .filter(m => m !== null);  // Remove invalid items
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE UTILITY FUNCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Check if a URL is a valid image/video URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Must be HTTP(S)
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Ensure URL uses HTTPS
 */
function ensureHttps(url) {
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:');
  return url;
}

module.exports = {
  sanitizePostForResponse,
  sanitizePostsForResponse,
  normalizeMediaArray,
};
