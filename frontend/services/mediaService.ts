import { post } from './api';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLIFIED UPLOAD SERVICE (Backend-Centric)
// 
// All uploads are handled by the backend:
// - Frontend sends FormData with the file
// - Backend handles Cloudinary/S3 logic
// - Frontend receives URL and publicId
//
// This eliminates duplicate code, improves maintainability, and reduces
// client-side complexity.
// ─────────────────────────────────────────────────────────────────────────────

export type MediaFolder = 
  | 'profile'
  | 'cover'
  | 'post'
  | 'chat';

interface UploadResult {
  success: boolean;
  message: string;
  url: string;       // Cloudinary/CloudFront URL
  publicId: string;  // Cloudinary public_id or S3 key
  secureUrl?: string;
  resourceType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect MIME type from a file URI based on its extension.
 */
export function getMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
}

/**
 * Convert a file URI to a File object (web) or native object (mobile).
 * 
 * On web: Fetches the file from the URI and wraps it in a File object that
 * FormData can properly serialize and send as multipart/form-data.
 * 
 * On native: Returns the native ImagePicker object format { uri, type, name }
 * which React Native's FormData handles natively.
 * 
 * @param fileUri   File URI from image/video picker (e.g. "file://..." or "data://...")
 * @param fileName  File name (e.g. "photo.jpg")
 * @returns File object (web) or { uri, type, name: string } object (native)
 */
async function uriToFile(
  fileUri: string,
  fileName: string
): Promise<File | { uri: string; type: string; name: string }> {
  // On native platforms (iOS/Android), return the native format
  // React Native's FormData handles this natively
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return {
      uri: fileUri,
      type: getMimeType(fileUri),
      name: fileName,
    };
  }

  // On web: Convert URI to File object for proper FormData serialization
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Create a File object from the blob
    // This allows FormData to properly serialize it as multipart/form-data
    const file = new File([blob], fileName, { type: getMimeType(fileUri) });
    return file;
  } catch (error) {
    console.error('Error converting URI to File:', error);
    // Fallback to native format if conversion fails
    return {
      uri: fileUri,
      type: getMimeType(fileUri),
      name: fileName,
    };
  }
}

/**
 * Get file size from a local URI.
 * Returns size in bytes.
 */
export const getFileSizeFromUri = async (fileUri: string): Promise<number> => {
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    return blob.size;
  } catch (error) {
    console.error('Error getting file size:', error);
    throw new Error('Could not determine file size');
  }
};

/**
 * Validate file size against limit.
 * Returns { valid: boolean, message?: string }
 */
export const validateFileSize = (
  fileSize: number,
  maxSizeMB: number = 100
): { valid: boolean; message?: string } => {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (fileSize > maxBytes) {
    return {
      valid: false,
      message: `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds limit of ${maxSizeMB}MB. Please choose a smaller file.`,
    };
  }
  return { valid: true };
};

/**
 * Detect media type based on aspect ratio and duration.
 * 
 * Rules:
 * - Image: width/height ratio close to 1:1 or 3:2
 * - Flick: 9:16 aspect ratio (or close to it) AND duration <= 60 seconds
 * - Video: 16:9 aspect ratio (or close to it) AND any duration > 60s allowed
 * - Default: Use MIME type if aspect ratio unclear
 * 
 * @returns 'image' | 'video' | 'flick'
 */
export const detectMediaTypeByAspectRatio = (
  mediaType: 'image' | 'video' | 'flick',
  width: number,
  height: number,
  duration?: number
): 'image' | 'video' | 'flick' => {
  // If already determined as image, keep it as image
  if (mediaType === 'image') return 'image';

  // For videos, check aspect ratio
  const aspectRatio = width / height;
  const tolerance = 0.15; // Allow ±15% deviation from ideal ratio

  // Flick detection: 9:16 = 0.5625 aspect ratio (tall/portrait)
  const flickRatio = 9 / 16; // 0.5625
  const isFlickAspect = Math.abs(aspectRatio - flickRatio) < tolerance;

  // Video detection: 16:9 = 1.777... (wide/landscape)
  const videoRatio = 16 / 9; // 1.777...
  const isVideoAspect = Math.abs(aspectRatio - videoRatio) < tolerance;

  // If duration is provided, use it as primary indicator for videos
  if (duration !== undefined) {
    const durationSeconds = duration / 1000; // Convert ms to seconds
    if (durationSeconds <= 60) {
      // Short video -> check aspect ratio
      return isFlickAspect ? 'flick' : 'video';
    } else {
      // Long video -> classify as video regardless of aspect ratio
      return 'video';
    }
  }

  // Aspect ratio-based detection (for cases without duration)
  if (isFlickAspect) return 'flick';
  if (isVideoAspect) return 'video';

  // Default: portrait aspect ratio (~0.5-0.75) -> flick, landscape -> video
  return aspectRatio < 1 ? 'flick' : 'video';
};

/**
 * Detect media type (image or video) from file URI by file extension.
 * 
 * @param fileUri File URI (e.g. "file:///path/to/video.mp4")
 * @returns 'image' | 'video'
 */
export const detectMediaTypeFromUri = (fileUri: string): 'image' | 'video' => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'];
  
  const ext = fileUri.split('.').pop()?.toLowerCase() || '';
  
  if (imageExtensions.includes(ext)) {
    return 'image';
  }
  if (videoExtensions.includes(ext)) {
    return 'video';
  }
  
  // Default to image if extension is unclear
  return 'image';
};

/**
 * Detect media type from ImagePicker asset.
 * ImagePicker.ImagePickerAsset has a 'type' field that can be 'image' or 'video'.
 * 
 * @param asset ImagePicker asset
 * @returns 'image' | 'video'
 */
export const detectMediaTypeFromAsset = (asset: any): 'image' | 'video' => {
  // Check if asset has a type field (ImagePicker v13+)
  if (asset.type) {
    return asset.type === 'video' ? 'video' : 'image';
  }
  
  // Fallback to URI-based detection
  return detectMediaTypeFromUri(asset.uri);
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN UPLOAD FUNCTIONS (Backend-Centric)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a video to the backend.
 * Backend handles Cloudinary upload and returns the URL.
 * 
 * @param fileUri  Local file URI from video picker
 * @param fileName Original file name (e.g. "my-video.mp4")
 * @returns        { url, publicId }
 */
export const uploadVideo = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log('[uploadVideo] Uploading:', { fileName, platform: Platform.OS });
    const response = await post('/media/upload/video', formData);
    return response;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

/**
 * Upload an image to the backend.
 * Backend handles Cloudinary upload and returns the URL.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "photo.jpg")
 * @returns        { url, publicId }
 */
export const uploadImage = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log('[uploadImage] Uploading:', { fileName, platform: Platform.OS });
    const response = await post('/media/upload/image', formData);
    return response;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

/**
 * Upload an audio file to the backend.
 * Backend handles Cloudinary upload and returns the URL.
 * 
 * @param fileUri  Local file URI from audio picker
 * @param fileName Original file name (e.g. "recording.mp3")
 * @returns        { url, publicId }
 */
export const uploadAudio = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log('[uploadAudio] Uploading:', { fileName, platform: Platform.OS });
    const response = await post('/media/upload/audio', formData);
    return response;
  } catch (error) {
    console.error('Error uploading audio:', error);
    throw error;
  }
};

/**
 * Upload a profile picture to the backend.
 * Backend handles Cloudinary upload AND updates the User model.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "avatar.jpg")
 * @returns        { url, publicId }
 */
/**
 * Upload a profile picture to the backend.
 * 
 * ARCHITECTURE: Backend-Centric Upload
 * - Frontend sends FormData with compressed image
 * - Backend handles Cloudinary upload to: myapp/profile/current/{userId}
 * - Backend auto-deletes old profile picture and updates User model
 * - Frontend receives: { url, publicId }
 * 
 * NOTE ON CLOUDINARY PRESETS:
 * The backend uses programmatic Cloudinary API uploads (not preset-based).
 * This ensures the folder structure (myapp/profile/current/{userId}) is
 * consistent and independent of Cloudinary preset configurations.
 * 
 * @param fileUri   Local file URI from image picker
 * @param fileName  File name (e.g. "profile_1712953200000.jpg")
 * @returns         { url, publicId } from successful upload
 * @throws          Error if upload fails (size, format, network, etc)
 */
export const uploadProfilePicture = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    
    // ✅ FIX: Construct FormData carefully for React Native compatibility
    const formData = new FormData();
    
    // On React Native, FormData expects: { uri, type, name }
    // On web, it can accept File objects
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // React Native: Use native format directly
      formData.append('file', fileData as any);
    } else {
      // Web: Use File object
      formData.append('file', fileData as any);
    }

    console.log('[uploadProfilePicture] Uploading:', {
      fileName,
      fileType: (fileData as any).type,
      platform: Platform.OS,
    });

    const response = await post('/media/upload/profile-picture', formData);
    return response;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw error;
  }
};

/**
 * Upload a cover photo to the backend.
 * Backend handles Cloudinary upload AND updates the User model.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "cover.jpg")
 * @returns        { url, publicId }
 */
export const uploadCoverPhoto = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    const response = await post('/media/upload/cover-photo', formData);
    return response;
  } catch (error) {
    console.error('Error uploading cover photo:', error);
    throw error;
  }
};

/**
 * Upload a story image to the backend.
 * Backend handles Cloudinary upload to the correct stories/images folder.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "story-123.jpg")
 * @returns        { url, publicId, secureUrl }
 */
export const uploadStoryImage = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log('[uploadStoryImage] Uploading:', { fileName, platform: Platform.OS });
    const response = await post('/media/upload/story-image', formData);
    return response;
  } catch (error) {
    console.error('Error uploading story image:', error);
    throw error;
  }
};

/**
 * Upload a story video to the backend.
 * Backend handles Cloudinary upload to the correct stories/videos folder.
 * 
 * @param fileUri  Local file URI from video picker
 * @param fileName Original file name (e.g. "story-video-123.mp4")
 * @returns        { url, publicId, secureUrl }
 */
export const uploadStoryVideo = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

    console.log('[uploadStoryVideo] Uploading:', { fileName, platform: Platform.OS });
    const response = await post('/media/upload/story-video', formData);
    return response;
  } catch (error) {
    console.error('Error uploading story video:', error);
    throw error;
  }
};

/**
 * Delete an uploaded file from Cloudinary.
 * 
 * @param publicId Cloudinary public_id of the file to delete
 */
export const deleteUploadedFile = async (publicId: string): Promise<void> => {
  try {
    await post(`/media/${publicId}`, {});
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

/**
 * Backward compatibility alias for uploadImage.
 * Use uploadImage() instead.
 */
export const uploadMediaDirect = uploadImage;

/**
 * Backward compatibility wrapper.
 * For components that still use the old uploadMedia() function.
 */
export const uploadMedia = async (
  fileUri: string,
  fileName: string
): Promise<{ url: string; key: string }> => {
  const result = await uploadImage(fileUri, fileName);
  return {
    url: result.url,
    key: result.publicId,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATED UPLOAD FUNCTIONS (WITH PRE-UPLOAD VALIDATION)
//
// These functions perform file validation BEFORE upload, catching errors early
// and providing better user experience with instant feedback.
// Use these instead of the raw upload functions for user-facing features.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload an image with pre-upload validation.
 * Validates file type, size, and dimensions BEFORE sending to server.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "photo.jpg")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadImageWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    // Import validation service
    const { validateImageFile, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    // Validate before upload
    console.log('[uploadImageWithValidation] Validating image:', { fileName });
    const validation = await validateImageFile(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadImageWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Image validation failed');
    }

    console.log('[uploadImageWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
      dimensions: `${validation.imageData?.width}x${validation.imageData?.height}`,
    });

    // Proceed with upload
    const result = await uploadImage(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadImageWithValidation:', error);
    throw error;
  }
};

/**
 * Upload a video with pre-upload validation.
 * Validates file type, size, and duration BEFORE sending to server.
 * 
 * @param fileUri  Local file URI from video picker
 * @param fileName Original file name (e.g. "video.mp4")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadVideoWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    // Import validation service
    const { validateVideoFile, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    // Validate before upload
    console.log('[uploadVideoWithValidation] Validating video:', { fileName });
    const validation = await validateVideoFile(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadVideoWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Video validation failed');
    }

    console.log('[uploadVideoWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
      duration: `${(validation.videoData?.duration || 0) / 1000}s`,
      dimensions: `${validation.videoData?.width}x${validation.videoData?.height}`,
    });

    // Proceed with upload
    const result = await uploadVideo(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadVideoWithValidation:', error);
    throw error;
  }
};

/**
 * Upload a profile picture with pre-upload validation.
 * Validates file type, size, and dimensions BEFORE sending to server.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "avatar.jpg")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadProfilePictureWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    // Import validation service
    const { validateProfilePicture, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    // Validate before upload
    console.log('[uploadProfilePictureWithValidation] Validating profile picture:', {
      fileName,
    });
    const validation = await validateProfilePicture(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadProfilePictureWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Profile picture validation failed');
    }

    console.log('[uploadProfilePictureWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
      dimensions: `${validation.imageData?.width}x${validation.imageData?.height}`,
    });

    // Proceed with upload
    const result = await uploadProfilePicture(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadProfilePictureWithValidation:', error);
    throw error;
  }
};

/**
 * Upload a cover photo with pre-upload validation.
 * Validates file type, size, and dimensions BEFORE sending to server.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "cover.jpg")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadCoverPhotoWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    // Import validation service
    const { validateCoverPhoto, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    // Validate before upload
    console.log('[uploadCoverPhotoWithValidation] Validating cover photo:', {
      fileName,
    });
    const validation = await validateCoverPhoto(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadCoverPhotoWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Cover photo validation failed');
    }

    console.log('[uploadCoverPhotoWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
      dimensions: `${validation.imageData?.width}x${validation.imageData?.height}`,
    });

    // Proceed with upload
    const result = await uploadCoverPhoto(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadCoverPhotoWithValidation:', error);
    throw error;
  }
};

/**
 * Upload a story image with pre-upload validation.
 * 
 * @param fileUri  Local file URI from image picker
 * @param fileName Original file name (e.g. "story.jpg")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadStoryImageWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    const { validateStoryImage, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    console.log('[uploadStoryImageWithValidation] Validating story image:', {
      fileName,
    });
    const validation = await validateStoryImage(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadStoryImageWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Story image validation failed');
    }

    console.log('[uploadStoryImageWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
    });

    const result = await uploadStoryImage(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadStoryImageWithValidation:', error);
    throw error;
  }
};

/**
 * Upload a story video with pre-upload validation.
 * 
 * @param fileUri  Local file URI from video picker
 * @param fileName Original file name (e.g. "story-video.mp4")
 * @returns        { url, publicId, validationPassed: true }
 * @throws         Error with validation details if validation fails
 */
export const uploadStoryVideoWithValidation = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult & { validationPassed: boolean }> => {
  try {
    const { validateStoryVideo, getValidationErrorMessage } = await import(
      './fileValidationService'
    );

    console.log('[uploadStoryVideoWithValidation] Validating story video:', {
      fileName,
    });
    const validation = await validateStoryVideo(fileUri);

    if (!validation.valid) {
      const errorMessage = getValidationErrorMessage(validation);
      console.error('[uploadStoryVideoWithValidation] Validation failed:', {
        fileName,
        errors: validation.errors,
      });
      throw new Error(errorMessage || 'Story video validation failed');
    }

    console.log('[uploadStoryVideoWithValidation] Validation passed, uploading:', {
      fileName,
      size: `${validation.fileSizeMB.toFixed(2)}MB`,
      duration: `${(validation.videoData?.duration || 0) / 1000}s`,
    });

    const result = await uploadStoryVideo(fileUri, fileName);
    return { ...result, validationPassed: true };
  } catch (error) {
    console.error('Error in uploadStoryVideoWithValidation:', error);
    throw error;
  }
};
