/**
 * Upload Service
 * Handles all post, story, and media uploads with proper API integration
 */

import { post } from './api';
import { uploadImage, uploadVideo, getMimeType } from './mediaService';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload to a specific storage folder endpoint
 * Allows fine-grained control over Cloudinary folder placement
 * 
 * @param fileUri Local file URI
 * @param fileName Original filename
 * @param endpoint Backend endpoint: 'story-image', 'story-video', 'image', 'video',
 *                 'profile-picture', 'cover-photo', or 'audio'
 * @returns Upload result with url and publicId
 */
async function uploadToStorageFolder(
  fileUri: string,
  fileName: string,
  endpoint: 'story-image' | 'story-video' | 'image' | 'video' | 'profile-picture' | 'cover-photo' | 'audio'
) {
  return uploadWithRetry(async () => {
    console.log(`[uploadToStorageFolder] Starting upload - endpoint: /api/media/upload/${endpoint}, file: ${fileName}`);
    
    // Convert URI to File/native object
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log(`[uploadToStorageFolder] FormData prepared, attempting request to /api/media/upload/${endpoint}`);
    
    const response = await post(`/api/media/upload/${endpoint}`, formData);
    
    console.log(`[uploadToStorageFolder] Response received:`, response);
    
    // ⚠️ CRITICAL FIX: Correct validation logic
    // Original: if (!response.success && !response.url) — requires BOTH to be false (wrong!)
    // Fixed: if (!response.success || !response.url) — fails if EITHER is false (correct!)
    if (!response.success || !response.url) {
      throw new Error(response.message || `Failed to upload to ${endpoint}`);
    }

    return {
      url: response.url,
      publicId: response.publicId,
      secureUrl: response.secureUrl,
      resourceType: response.resourceType,
      duration: (response as any).duration || null,
    };
  }, 3); // Retry up to 3 times
}

/**
 * Convert a file URI to a File object (web) or native object (mobile)
 * Mirrors implementation in mediaService.ts
 */
async function uriToFile(
  fileUri: string,
  fileName: string
): Promise<File | { uri: string; type: string; name: string }> {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return {
      uri: fileUri,
      type: getMimeType(fileUri),
      name: fileName,
    };
  }

  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: getMimeType(fileUri) });
    return file;
  } catch (error) {
    console.error('Error converting URI to File:', error);
    return {
      uri: fileUri,
      type: getMimeType(fileUri),
      name: fileName,
    };
  }
}

/**
 * Determine if an error is retryable
 * 
 * Retryable errors include:
 * - Network errors (connection refused, timeouts, DNS failures)
 * - Server errors (500, 502, 503, 504 - service unavailable)
 * - Rate limiting (429 - too many requests)
 * - Timeout (408 - request timeout)
 * 
 * Non-retryable errors:
 * - Client errors (400, 401, 403, 404)
 * - Validation errors
 * - Authentication failures
 * 
 * @param error The error to check
 * @returns true if the error should trigger a retry
 */
function isRetryableError(error: any): boolean {
  // HTTP status codes that should trigger a retry
  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
  
  // Network error codes that should trigger a retry
  const retryableNetworkCodes = [
    'ECONNABORTED',    // Connection aborted
    'ENOTFOUND',       // DNS lookup failed
    'ECONNREFUSED',    // Connection refused
    'ETIMEDOUT',       // Operation timed out
    'ENETUNREACH',     // Network unreachable
    'EHOSTUNREACH',    // Host unreachable
  ];

  // Check HTTP status code
  if (error?.status && retryableStatusCodes.includes(error.status)) {
    return true;
  }

  // Check response status (alternative field name)
  if (error?.response?.status && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  // Check network error codes
  if (error?.code && retryableNetworkCodes.includes(error.code)) {
    return true;
  }

  // Check error message for common network/timeout issues
  const message = (error?.message || '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('unable to reach') ||
    message.includes('server') && message.includes('error')
  );
}

/**
 * Calculate backoff delay with jitter
 * 
 * Uses exponential backoff to avoid overwhelming the server:
 * - Attempt 0: 1-2 seconds
 * - Attempt 1: 2-4 seconds
 * - Attempt 2: 4-8 seconds
 * - Attempt 3: 8-16 seconds (capped at 30 seconds)
 * 
 * Jitter (0-1000ms) prevents thundering herd problem
 * 
 * @param attempt Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function getBackoffDelay(attempt: number): number {
  const baseDelay = 1000 * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(baseDelay + jitter, 30000); // Max 30 seconds
}

/**
 * Retry upload with exponential backoff
 * Handles temporary network failures, timeouts, and server errors
 * 
 * @param uploadFn Async function that performs the upload
 * @param maxRetries Maximum number of retry attempts
 * @returns Upload result
 */
async function uploadWithRetry(
  uploadFn: () => Promise<any>,
  maxRetries: number = 3
): Promise<any> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[uploadWithRetry] Attempt ${attempt + 1}/${maxRetries + 1}`);
      return await uploadFn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      const hasMoreAttempts = attempt < maxRetries;

      // Log error details for debugging
      console.error(`[uploadWithRetry] Attempt ${attempt + 1} failed:`, {
        status: error?.status || error?.response?.status,
        code: error?.code,
        message: error?.message,
        isRetryable,
        hasMoreAttempts,
      });

      // If error is not retryable or we're out of attempts, fail immediately
      if (!isRetryable || !hasMoreAttempts) {
        console.error(`[uploadWithRetry] ❌ Upload failed permanently after ${attempt + 1} attempts`);
        throw error;
      }

      // Calculate backoff delay with jitter
      const delayMs = getBackoffDelay(attempt);
      console.warn(`[uploadWithRetry] ⏳ Retrying in ${delayMs}ms (attempt ${attempt + 2}/${maxRetries + 1})`, {
        errorCode: error?.code,
        statusCode: error?.status || error?.response?.status,
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but throw last error just in case
  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UploadMode = 'Story' | 'Post' | 'Flick' | 'Long Video' | 'Freehand';

export interface UploadOptions {
  caption?: string;
  hashtags?: string[];
  visibility?: 'public' | 'private' | 'friends';
  location?: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  data?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Story Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a story (image or video, auto-expires in 24 hours)
 * Uses story-specific endpoints to ensure correct Cloudinary folder placement
 * Includes pre-upload validation to catch errors early
 * 
 * @param fileUri Local file URI
 * @param mediaType 'image' or 'video'
 * @param fileName Original filename
 * @returns Upload response with story data
 * @throws Error with validation message if file validation fails
 */
export const uploadStory = async (
  fileUri: string,
  mediaType: 'image' | 'video',
  fileName: string
): Promise<UploadResponse> => {
  try {
    console.log('[uploadStory] Starting story upload:', { mediaType, fileName });

    // Step 0: Validate file BEFORE upload
    // This prevents wasted bandwidth and provides instant user feedback
    try {
      const { validateStoryImage, validateStoryVideo, getValidationErrorMessage } = await import(
        './fileValidationService'
      );

      console.log('[uploadStory] Validating file:', { mediaType, fileName });
      
      let validation;
      if (mediaType === 'video') {
        validation = await validateStoryVideo(fileUri);
      } else {
        validation = await validateStoryImage(fileUri);
      }

      if (!validation.valid) {
        const errorMessage = getValidationErrorMessage(validation);
        console.error('[uploadStory] ❌ Validation failed:', {
          mediaType,
          fileName,
          errors: validation.errors,
        });
        throw new Error(errorMessage || `Story ${mediaType} validation failed`);
      }

      console.log('[uploadStory] ✅ Validation passed:', {
        mediaType,
        fileName,
        size: `${validation.fileSizeMB.toFixed(2)}MB`,
      });
    } catch (validationErr) {
      console.error('[uploadStory] Validation error:', validationErr);
      throw validationErr;
    }

    // Step 1: Upload media to correct story folder via backend
    // Use story-specific endpoints (story-image, story-video) to ensure
    // files go to myapp/stories/{images|videos}/{userId} in Cloudinary
    let uploadResult;
    try {
      if (mediaType === 'video') {
        console.log('[uploadStory] Uploading to story-video endpoint');
        uploadResult = await uploadToStorageFolder(fileUri, fileName, 'story-video');
      } else {
        console.log('[uploadStory] Uploading to story-image endpoint');
        uploadResult = await uploadToStorageFolder(fileUri, fileName, 'story-image');
      }
    } catch (uploadErr) {
      console.error('[uploadStory] Media upload failed:', uploadErr);
      throw new Error('Failed to upload media. Please try again.');
    }

    if (!uploadResult.url || !uploadResult.publicId) {
      throw new Error('Invalid upload response - missing URL or publicId');
    }

    console.log('[uploadStory] Media uploaded successfully:', { url: uploadResult.url });

    // Step 2: Create story in database
    const storyPayload = {
      mediaUrl: uploadResult.url,
      mediaPublicId: uploadResult.publicId,
      mediaType,
      thumbnailUrl: uploadResult.secureUrl || null,
      duration: (uploadResult as any).duration || null,
      textOverlay: [],
      drawings: [],
    };

    console.log('[uploadStory] Creating story record:', storyPayload);

    const response = await post('/api/stories', storyPayload);

    if (!response.success) {
      throw new Error(response.message || 'Failed to create story');
    }

    console.log('[uploadStory] ✅ Story created successfully:', response.data);

    return {
      success: true,
      message: 'Story uploaded successfully',
      data: response.data,
    };
  } catch (error) {
    console.error('[uploadStory] ❌ Upload failed:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Post Upload (includes Flick, Long Video, Freehand, regular Post)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a post with media
 * Routes to appropriate storage folder based on post type
 * 
 * @param fileUri Local file URI
 * @param mediaType 'image' or 'video'
 * @param fileName Original filename
 * @param mode Post type: 'Post', 'Flick', 'Long Video', 'Freehand'
 * @param options Additional options (caption, hashtags, visibility, location)
 * @returns Upload response with post data
 */
export const uploadPost = async (
  fileUri: string,
  mediaType: 'image' | 'video',
  fileName: string,
  mode: UploadMode,
  options: UploadOptions = {}
): Promise<UploadResponse> => {
  try {
    console.log('[uploadPost] Starting post upload:', { mediaType, mode, fileName });

    // Step 1: Upload media to Cloudinary via backend
    // For all post types (Post, Flick, Long Video, Freehand), use the standard
    // /api/media/upload/{image|video} endpoints which map to:
    //   - postImage folder (myapp/images/posts/original/{userId})
    //   - videoOriginal folder (myapp/videos/original/{userId})
    let uploadResult;
    try {
      if (mediaType === 'video') {
        console.log('[uploadPost] Uploading video to standard endpoint');
        uploadResult = await uploadToStorageFolder(fileUri, fileName, 'video');
      } else {
        console.log('[uploadPost] Uploading image to standard endpoint');
        uploadResult = await uploadToStorageFolder(fileUri, fileName, 'image');
      }
    } catch (uploadErr) {
      console.error('[uploadPost] Media upload failed:', uploadErr);
      throw new Error('Failed to upload media. Please try again.');
    }

    if (!uploadResult.url || !uploadResult.publicId) {
      throw new Error('Invalid upload response - missing URL or publicId');
    }

    console.log('[uploadPost] Media uploaded successfully:', { url: uploadResult.url });

    // Step 2: Build media object for the post
    // The backend Post controller expects an array of media objects
    const mediaObject = {
      public_id: uploadResult.publicId,
      secure_url: uploadResult.url,
      resource_type: mediaType,
      format: mediaType === 'video' ? 'mp4' : 'jpg',
      type: mediaType, // Some controllers might expect 'type' instead of 'resource_type'
    };

    // Step 3: Create post in database
    const postPayload = {
      media: [mediaObject], // API expects array of media objects
      caption: options.caption || '',
      hashtags: options.hashtags || [],
      visibility: options.visibility || 'public',
      location: options.location || null,
      // Additional metadata for analytics
      uploadMode: mode, // 'Post', 'Flick', 'Long Video', 'Freehand'
    };

    console.log('[uploadPost] Creating post record:', { ...postPayload, media: '[media object]' });

    const response = await post('/api/posts/upload', postPayload);

    if (!response.message || response.message.toLowerCase().includes('error')) {
      throw new Error(response.message || 'Failed to create post');
    }

    console.log('[uploadPost] ✅ Post created successfully:', response.post || response.data);

    return {
      success: true,
      message: 'Post uploaded successfully',
      data: response.post || response.data,
    };
  } catch (error) {
    console.error('[uploadPost] ❌ Upload failed:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Upload Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified upload handler that routes to the appropriate upload function
 * based on the upload mode
 * 
 * @param fileUri Local file URI
 * @param mediaType 'image' or 'video'
 * @param fileName Original filename
 * @param mode Upload mode
 * @param options Additional options
 * @returns Upload response
 */
export const handleMediaUpload = async (
  fileUri: string,
  mediaType: 'image' | 'video',
  fileName: string,
  mode: UploadMode,
  options: UploadOptions = {}
): Promise<UploadResponse> => {
  console.log('[handleMediaUpload] Processing upload:', { mediaType, mode, fileName });

  // Route to appropriate handler based on mode
  if (mode === 'Story') {
    return uploadStory(fileUri, mediaType, fileName);
  } else if (mode === 'Post' || mode === 'Flick' || mode === 'Long Video' || mode === 'Freehand') {
    return uploadPost(fileUri, mediaType, fileName, mode, options);
  } else {
    throw new Error(`Unknown upload mode: ${mode}`);
  }
};
