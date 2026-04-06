/**
 * Upload Error Handler Utility
 * Provides user-friendly error messages for upload failures
 */

export interface UploadErrorInfo {
  title: string;
  message: string;
  isRetryable: boolean;
}

/**
 * Parse upload error and return user-friendly message
 * @param error - The error object from upload attempt
 * @returns Object with title, message, and whether error is retryable
 */
export const parseUploadError = (error: any): UploadErrorInfo => {
  const defaultError: UploadErrorInfo = {
    title: 'Upload Failed',
    message: 'Something went wrong. Please try again.',
    isRetryable: true,
  };

  if (!error) return defaultError;

  // File size errors
  if (error.message?.includes('File size') || error.message?.includes('exceeds limit')) {
    return {
      title: 'File Too Large',
      message: error.message || 'File size exceeds the maximum limit of 100MB. Please choose a smaller file.',
      isRetryable: false,
    };
  }

  // File format/corruption errors
  if (error.message?.includes('Could not determine')) {
    return {
      title: 'Invalid File',
      message: 'Unable to read the file. It may be corrupted. Please try a different file.',
      isRetryable: false,
    };
  }

  // Unsupported format errors
  if (error.message?.includes('Invalid request') || error.message?.includes('400')) {
    return {
      title: 'Unsupported Format',
      message: 'The file format is not supported. Please use common formats like PNG, JPG, or MP4.',
      isRetryable: false,
    };
  }

  // Session/auth errors
  if (error.message?.includes('Access denied') || error.message?.includes('403')) {
    return {
      title: 'Session Expired',
      message: 'Your upload session has expired. Please try again.',
      isRetryable: true,
    };
  }

  // Network/Cloudinary errors
  if (error.message?.includes('Cloudinary') || error.message?.includes('server error')) {
    return {
      title: 'Network Error',
      message: 'Upload failed due to network error. Please check your internet connection and try again.',
      isRetryable: true,
    };
  }

  // Timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
    return {
      title: 'Connection Timeout',
      message: 'The upload is taking too long. Please check your connection and try again.',
      isRetryable: true,
    };
  }

  // Retry errors (already handled)
  if (error.message?.includes('Retrying')) {
    return {
      title: 'Upload Error',
      message: 'Upload failed after multiple attempts. Please check your internet and try again.',
      isRetryable: true,
    };
  }

  // API response errors
  if (error.response?.data?.message) {
    return {
      title: 'Upload Error',
      message: error.response.data.message,
      isRetryable: true,
    };
  }

  // Generic error message
  if (error.message) {
    return {
      title: 'Upload Failed',
      message: error.message,
      isRetryable: true,
    };
  }

  return defaultError;
};

/**
 * Parse profile save error and return user-friendly message
 * @param error - The error object from save attempt
 * @returns Object with title and message
 */
export const parseSaveProfileError = (error: any): UploadErrorInfo => {
  const defaultError: UploadErrorInfo = {
    title: 'Save Failed',
    message: 'Failed to save changes. Please try again.',
    isRetryable: true,
  };

  if (!error) return defaultError;

  // Username conflict
  if (error.response?.status === 409) {
    return {
      title: 'Username Unavailable',
      message: 'This username is already taken. Please choose a different username.',
      isRetryable: false,
    };
  }

  // Invalid input
  if (error.response?.status === 400) {
    return {
      title: 'Invalid Input',
      message: error.response?.data?.message || 'Please check your input and try again.',
      isRetryable: false,
    };
  }

  // Auth error
  if (error.response?.status === 401) {
    return {
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      isRetryable: false,
    };
  }

  // Server error
  if (error.response?.status >= 500) {
    return {
      title: 'Server Error',
      message: 'The server is temporarily unavailable. Please try again later.',
      isRetryable: true,
    };
  }

  // Network error
  if (error.message?.includes('Network') || error.message?.includes('timeout') || error.message?.includes('Timeout')) {
    return {
      title: 'Network Error',
      message: 'Network error occurred. Please check your internet connection and try again.',
      isRetryable: true,
    };
  }

  return defaultError;
};

/**
 * Get user-friendly tooltip for file selection
 */
export const getFileSelectionTip = (fileType: 'image' | 'video'): string => {
  if (fileType === 'image') {
    return 'Supports PNG, JPG, GIF, WebP. Max size: 100MB';
  }
  return 'Supports MP4, MOV, AVI. Max size: 100MB. Max duration: 60 seconds';
};

/**
 * Validate file before upload
 * @returns { valid: boolean, message?: string }
 */
export const validateFileBeforeUpload = (
  fileSize: number,
  mimeType: string,
  fileType: 'image' | 'video'
): { valid: boolean; message?: string } => {
  const MAX_SIZE_MB = 100;
  const maxBytes = MAX_SIZE_MB * 1024 * 1024;

  // Check file size
  if (fileSize > maxBytes) {
    return {
      valid: false,
      message: `File is ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum allowed size is ${MAX_SIZE_MB}MB.`,
    };
  }

  // Check MIME type
  const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  const validTypes = fileType === 'image' ? validImageTypes : validVideoTypes;

  if (!validTypes.includes(mimeType)) {
    const supportedFormats = fileType === 'image' ? 'PNG, JPG, GIF, WebP' : 'MP4, MOV, AVI';
    return {
      valid: false,
      message: `File format not supported. Please use: ${supportedFormats}`,
    };
  }

  return { valid: true };
};
