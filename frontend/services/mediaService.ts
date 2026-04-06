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
 * @returns File object (web) or { uri, type, name } object (native)
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
export const uploadProfilePicture = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    const fileData = await uriToFile(fileUri, fileName);
    const formData = new FormData();
    formData.append('file', fileData as any);

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
