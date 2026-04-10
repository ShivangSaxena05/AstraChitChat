/**
 * File Validation Service
 * 
 * Provides pre-upload validation for files including:
 * - MIME type validation
 * - File size validation
 * - Image/video aspect ratio validation
 * - Video duration validation
 * 
 * This catches errors BEFORE upload starts, preventing wasted bandwidth
 * and providing better user experience with early feedback.
 */

import { Platform } from 'react-native';
import { getMimeType, detectMediaTypeFromUri } from './mediaService';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface FileValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImageValidationResult {
  valid: boolean;
  width?: number;
  height?: number;
  aspectRatio?: number;
  errors: FileValidationError[];
}

export interface VideoValidationResult {
  valid: boolean;
  duration?: number; // in milliseconds
  width?: number;
  height?: number;
  aspectRatio?: number;
  errors: FileValidationError[];
}

export interface FileValidationResult {
  valid: boolean;
  fileSize: number; // in bytes
  fileSizeMB: number; // in megabytes
  mimeType: string;
  errors: FileValidationError[];
  imageData?: ImageValidationResult;
  videoData?: VideoValidationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATION_CONFIG = {
  image: {
    maxSizeMB: 50,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    minWidth: 100,
    minHeight: 100,
    maxWidth: 8000,
    maxHeight: 8000,
  },
  video: {
    maxSizeMB: 500,
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'],
    allowedExtensions: ['mp4', 'mov', 'avi', 'mkv'],
    maxDurationSeconds: 3600, // 1 hour
    minDurationSeconds: 1, // 1 second
  },
  story: {
    image: {
      maxSizeMB: 50,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    },
    video: {
      maxSizeMB: 100,
      allowedExtensions: ['mp4', 'mov'],
      maxDurationSeconds: 60, // Story max 60 seconds
    },
  },
  profilePicture: {
    maxSizeMB: 20,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    minWidth: 150,
    minHeight: 150,
    recommendedMinWidth: 300,
    recommendedMinHeight: 300,
  },
  coverPhoto: {
    maxSizeMB: 30,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    minWidth: 300,
    minHeight: 100,
    recommendedWidth: 1200,
    recommendedHeight: 400,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get file size from a file URI
 */
export const getFileSizeFromUri = async (fileUri: string): Promise<number> => {
  try {
    // On native platforms, we need to use native file system APIs
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // Use the native fetch API which works on React Native
      const response = await fetch(fileUri);
      const blob = await response.blob();
      return blob.size;
    }

    // On web, use fetch
    const response = await fetch(fileUri);
    const blob = await response.blob();
    return blob.size;
  } catch (error) {
    console.error('[getFileSizeFromUri] Error getting file size:', error);
    throw new Error('Could not determine file size. File may be inaccessible.');
  }
};

/**
 * Get image dimensions from a file URI
 */
export const getImageDimensions = async (
  fileUri: string
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();

      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image. File may be corrupted.'));
      };

      img.onabort = () => {
        reject(new Error('Image loading was aborted.'));
      };

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Image loading timed out.'));
      }, 10000); // 10 seconds

      img.src = fileUri;

      img.addEventListener('load', () => clearTimeout(timeout));
      img.addEventListener('error', () => clearTimeout(timeout));
    } catch (error) {
      reject(new Error('Error processing image dimensions'));
    }
  });
};

/**
 * Get video metadata (duration and dimensions)
 */
export const getVideoMetadata = async (
  fileUri: string
): Promise<{ duration: number; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Video metadata loading timed out.'));
      }, 15000); // 15 seconds

      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({
          duration: video.duration * 1000, // Convert to milliseconds
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load video metadata. File may be corrupted or unsupported.'));
      };

      // Prevent error spam
      video.addEventListener('error', () => clearTimeout(timeout));

      // Set source and load
      video.src = fileUri;
    } catch (error) {
      reject(new Error('Error processing video metadata'));
    }
  });
};

/**
 * Validate file extension against allowed extensions
 */
const validateFileExtension = (
  fileUri: string,
  allowedExtensions: string[]
): FileValidationError | null => {
  const ext = fileUri.split('.').pop()?.toLowerCase() || '';

  if (!allowedExtensions.includes(ext)) {
    return {
      code: 'INVALID_EXTENSION',
      message: `File extension ".${ext}" is not allowed. Allowed types: ${allowedExtensions.join(', ')}`,
      severity: 'error',
    };
  }

  return null;
};

/**
 * Validate MIME type against allowed MIME types
 */
const validateMimeType = (
  mimeType: string,
  allowedMimeTypes: string[]
): FileValidationError | null => {
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      code: 'INVALID_MIME_TYPE',
      message: `File MIME type "${mimeType}" is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
      severity: 'error',
    };
  }

  return null;
};

/**
 * Validate file size against max size limit
 */
const validateFileSize = (
  fileSize: number,
  maxSizeMB: number
): FileValidationError | null => {
  const fileSizeMB = fileSize / (1024 * 1024);

  if (fileSizeMB > maxSizeMB) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `File size (${fileSizeMB.toFixed(2)}MB) exceeds the maximum limit of ${maxSizeMB}MB.`,
      severity: 'error',
    };
  }

  return null;
};

/**
 * Validate image dimensions
 */
const validateImageDimensions = (
  width: number,
  height: number,
  config: typeof VALIDATION_CONFIG.image
): FileValidationError[] => {
  const errors: FileValidationError[] = [];

  if (width < config.minWidth || height < config.minHeight) {
    errors.push({
      code: 'IMAGE_TOO_SMALL',
      message: `Image dimensions (${width}x${height}) are too small. Minimum required: ${config.minWidth}x${config.minHeight}px.`,
      severity: 'error',
    });
  }

  if (width > config.maxWidth || height > config.maxHeight) {
    errors.push({
      code: 'IMAGE_TOO_LARGE',
      message: `Image dimensions (${width}x${height}) are too large. Maximum allowed: ${config.maxWidth}x${config.maxHeight}px.`,
      severity: 'error',
    });
  }

  return errors;
};

/**
 * Validate video duration
 */
const validateVideoDuration = (
  duration: number,
  config: typeof VALIDATION_CONFIG.video
): FileValidationError[] => {
  const errors: FileValidationError[] = [];
  const durationSeconds = duration / 1000;

  if (durationSeconds < config.minDurationSeconds) {
    errors.push({
      code: 'VIDEO_TOO_SHORT',
      message: `Video duration (${durationSeconds.toFixed(1)}s) is too short. Minimum required: ${config.minDurationSeconds}s.`,
      severity: 'error',
    });
  }

  if (durationSeconds > config.maxDurationSeconds) {
    errors.push({
      code: 'VIDEO_TOO_LONG',
      message: `Video duration (${(durationSeconds / 60).toFixed(1)}m) exceeds the maximum limit of ${config.maxDurationSeconds / 60}m.`,
      severity: 'error',
    });
  }

  return errors;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an image file before upload
 * Checks: file size, MIME type, extension, dimensions
 */
export const validateImageFile = async (
  fileUri: string,
  maxSizeMB: number = VALIDATION_CONFIG.image.maxSizeMB
): Promise<FileValidationResult> => {
  const errors: FileValidationError[] = [];
  let imageData: ImageValidationResult | undefined;

  try {
    // 1. Get file size
    const fileSize = await getFileSizeFromUri(fileUri);
    const fileSizeMB = fileSize / (1024 * 1024);
    const mimeType = getMimeType(fileUri);

    console.log('[validateImageFile]', { fileSize, fileSizeMB, mimeType });

    // 2. Validate file extension
    const extError = validateFileExtension(
      fileUri,
      VALIDATION_CONFIG.image.allowedExtensions
    );
    if (extError) errors.push(extError);

    // 3. Validate MIME type
    const mimeError = validateMimeType(
      mimeType,
      VALIDATION_CONFIG.image.allowedMimeTypes
    );
    if (mimeError) errors.push(mimeError);

    // 4. Validate file size
    const sizeError = validateFileSize(fileSize, maxSizeMB);
    if (sizeError) errors.push(sizeError);

    // 5. Get image dimensions and validate
    try {
      const { width, height } = await getImageDimensions(fileUri);
      const aspectRatio = width / height;
      const dimensionErrors = validateImageDimensions(
        width,
        height,
        VALIDATION_CONFIG.image
      );

      imageData = {
        valid: dimensionErrors.length === 0,
        width,
        height,
        aspectRatio,
        errors: dimensionErrors,
      };

      errors.push(...dimensionErrors);
    } catch (error) {
      console.error('[validateImageFile] Error getting image dimensions:', error);
      errors.push({
        code: 'IMAGE_DIMENSION_ERROR',
        message: `Could not read image dimensions: ${(error as Error).message}`,
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      fileSize,
      fileSizeMB,
      mimeType,
      errors,
      imageData,
    };
  } catch (error) {
    console.error('[validateImageFile] Validation error:', error);
    errors.push({
      code: 'IMAGE_VALIDATION_ERROR',
      message: `Image validation failed: ${(error as Error).message}`,
      severity: 'error',
    });

    return {
      valid: false,
      fileSize: 0,
      fileSizeMB: 0,
      mimeType: getMimeType(fileUri),
      errors,
    };
  }
};

/**
 * Validate a video file before upload
 * Checks: file size, MIME type, extension, duration
 */
export const validateVideoFile = async (
  fileUri: string,
  maxSizeMB: number = VALIDATION_CONFIG.video.maxSizeMB,
  maxDurationSeconds: number = VALIDATION_CONFIG.video.maxDurationSeconds
): Promise<FileValidationResult> => {
  const errors: FileValidationError[] = [];
  let videoData: VideoValidationResult | undefined;

  try {
    // 1. Get file size
    const fileSize = await getFileSizeFromUri(fileUri);
    const fileSizeMB = fileSize / (1024 * 1024);
    const mimeType = getMimeType(fileUri);

    console.log('[validateVideoFile]', { fileSize, fileSizeMB, mimeType });

    // 2. Validate file extension
    const extError = validateFileExtension(
      fileUri,
      VALIDATION_CONFIG.video.allowedExtensions
    );
    if (extError) errors.push(extError);

    // 3. Validate MIME type
    const mimeError = validateMimeType(
      mimeType,
      VALIDATION_CONFIG.video.allowedMimeTypes
    );
    if (mimeError) errors.push(mimeError);

    // 4. Validate file size
    const sizeError = validateFileSize(fileSize, maxSizeMB);
    if (sizeError) errors.push(sizeError);

    // 5. Get video metadata and validate
    try {
      const metadata = await getVideoMetadata(fileUri);
      const aspectRatio = metadata.width / metadata.height;
      const durationErrors = validateVideoDuration(metadata.duration, {
        maxDurationSeconds,
        minDurationSeconds: VALIDATION_CONFIG.video.minDurationSeconds,
      } as any);

      videoData = {
        valid: durationErrors.length === 0,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        aspectRatio,
        errors: durationErrors,
      };

      errors.push(...durationErrors);
    } catch (error) {
      console.error('[validateVideoFile] Error getting video metadata:', error);
      errors.push({
        code: 'VIDEO_METADATA_ERROR',
        message: `Could not read video metadata: ${(error as Error).message}`,
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      fileSize,
      fileSizeMB,
      mimeType,
      errors,
      videoData,
    };
  } catch (error) {
    console.error('[validateVideoFile] Validation error:', error);
    errors.push({
      code: 'VIDEO_VALIDATION_ERROR',
      message: `Video validation failed: ${(error as Error).message}`,
      severity: 'error',
    });

    return {
      valid: false,
      fileSize: 0,
      fileSizeMB: 0,
      mimeType: getMimeType(fileUri),
      errors,
    };
  }
};

/**
 * Validate a profile picture before upload
 */
export const validateProfilePicture = async (
  fileUri: string
): Promise<FileValidationResult> => {
  const config = VALIDATION_CONFIG.profilePicture;
  const result = await validateImageFile(fileUri, config.maxSizeMB);

  if (result.imageData && result.imageData.width && result.imageData.height) {
    // Additional validation for profile picture dimensions
    const { width, height } = result.imageData;
    const dimensionErrors: FileValidationError[] = [];

    if (width < config.minWidth || height < config.minHeight) {
      dimensionErrors.push({
        code: 'PROFILE_PIC_TOO_SMALL',
        message: `Profile picture (${width}x${height}) must be at least ${config.minWidth}x${config.minHeight}px. Recommended: ${config.recommendedMinWidth}x${config.recommendedMinHeight}px.`,
        severity: 'error',
      });
    } else if (
      width < config.recommendedMinWidth ||
      height < config.recommendedMinHeight
    ) {
      dimensionErrors.push({
        code: 'PROFILE_PIC_LOW_QUALITY',
        message: `Profile picture is smaller than recommended (${width}x${height}px). Recommended size: ${config.recommendedMinWidth}x${config.recommendedMinHeight}px for best quality.`,
        severity: 'warning',
      });
    }

    if (result.imageData) {
      result.imageData.errors.push(...dimensionErrors);
      result.imageData.valid = dimensionErrors.every((e) => e.severity === 'warning');
    }
    result.errors.push(...dimensionErrors);
  }

  return result;
};

/**
 * Validate a cover photo before upload
 */
export const validateCoverPhoto = async (
  fileUri: string
): Promise<FileValidationResult> => {
  const config = VALIDATION_CONFIG.coverPhoto;
  const result = await validateImageFile(fileUri, config.maxSizeMB);

  if (result.imageData && result.imageData.width && result.imageData.height) {
    const { width, height } = result.imageData;
    const dimensionErrors: FileValidationError[] = [];

    if (width < config.minWidth || height < config.minHeight) {
      dimensionErrors.push({
        code: 'COVER_PHOTO_TOO_SMALL',
        message: `Cover photo (${width}x${height}) must be at least ${config.minWidth}x${config.minHeight}px. Recommended: ${config.recommendedWidth}x${config.recommendedHeight}px.`,
        severity: 'error',
      });
    } else if (width < config.recommendedWidth || height < config.recommendedHeight) {
      dimensionErrors.push({
        code: 'COVER_PHOTO_LOW_QUALITY',
        message: `Cover photo is smaller than recommended (${width}x${height}px). Recommended size: ${config.recommendedWidth}x${config.recommendedHeight}px for best appearance.`,
        severity: 'warning',
      });
    }

    if (result.imageData) {
      result.imageData.errors.push(...dimensionErrors);
      result.imageData.valid = dimensionErrors.every((e) => e.severity === 'warning');
    }
    result.errors.push(...dimensionErrors);
  }

  return result;
};

/**
 * Validate a story image before upload
 */
export const validateStoryImage = async (
  fileUri: string
): Promise<FileValidationResult> => {
  return validateImageFile(
    fileUri,
    VALIDATION_CONFIG.story.image.maxSizeMB
  );
};

/**
 * Validate a story video before upload
 */
export const validateStoryVideo = async (
  fileUri: string
): Promise<FileValidationResult> => {
  return validateVideoFile(
    fileUri,
    VALIDATION_CONFIG.story.video.maxSizeMB,
    VALIDATION_CONFIG.story.video.maxDurationSeconds
  );
};

/**
 * Validate any media file (auto-detect type)
 */
export const validateMediaFile = async (
  fileUri: string
): Promise<FileValidationResult> => {
  const mediaType = detectMediaTypeFromUri(fileUri);

  if (mediaType === 'video') {
    return validateVideoFile(fileUri);
  } else {
    return validateImageFile(fileUri);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions for UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get human-readable error message from validation result
 */
export const getValidationErrorMessage = (result: FileValidationResult): string => {
  if (result.valid) return '';

  // Get the first error message
  const errors = result.errors.filter((e) => e.severity === 'error');
  if (errors.length > 0) {
    return errors[0].message;
  }

  return 'File validation failed';
};

/**
 * Get all validation error messages
 */
export const getValidationErrorMessages = (
  result: FileValidationResult
): string[] => {
  return result.errors
    .filter((e) => e.severity === 'error')
    .map((e) => e.message);
};

/**
 * Get validation warning messages
 */
export const getValidationWarnings = (result: FileValidationResult): string[] => {
  return result.errors
    .filter((e) => e.severity === 'warning')
    .map((e) => e.message);
};

/**
 * Check if validation passed (no errors, warnings are OK)
 */
export const isValidationPassed = (result: FileValidationResult): boolean => {
  return result.errors.every((e) => e.severity === 'warning');
};
