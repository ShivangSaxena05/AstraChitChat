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
 * @param endpoint Backend endpoint: 'story-image', 'story-video', 'image', 'video'
 * @returns Upload result with url and publicId
 */
async function uploadToStorageFolder(
  fileUri: string,
  fileName: string,
  endpoint: 'story-image' | 'story-video' | 'image' | 'video'
) {
  try {
    // Convert URI to File/native object
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log(`[uploadToStorageFolder] Uploading to endpoint: /api/media/upload/${endpoint}`);
    const response = await post(`/api/media/upload/${endpoint}`, formData);
    
    if (!response.success && !response.url) {
      throw new Error(response.message || `Failed to upload to ${endpoint}`);
    }

    return {
      url: response.url,
      publicId: response.publicId,
      secureUrl: response.secureUrl,
      resourceType: response.resourceType,
      duration: (response as any).duration || null,
    };
  } catch (error) {
    console.error(`[uploadToStorageFolder] Failed to upload to ${endpoint}:`, error);
    throw error;
  }
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
 * 
 * @param fileUri Local file URI
 * @param mediaType 'image' or 'video'
 * @param fileName Original filename
 * @returns Upload response with story data
 */
export const uploadStory = async (
  fileUri: string,
  mediaType: 'image' | 'video',
  fileName: string
): Promise<UploadResponse> => {
  try {
    console.log('[uploadStory] Starting story upload:', { mediaType, fileName });

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
