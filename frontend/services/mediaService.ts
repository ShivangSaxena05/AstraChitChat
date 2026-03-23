import { get, post } from './api';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type MediaFolder = 'profile' | 'cover' | 'post' | 'chat';

interface PresignedUrlResponse {
  presignedUrl: string;   // PUT to this URL to upload directly to S3
  key: string;            // S3 object key — save as mediaKey in MongoDB
  cloudfrontUrl: string;  // CloudFront URL — save as mediaUrl in MongoDB
}

interface UploadResult {
  url: string;   // CloudFront URL
  key: string;   // S3 object key
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Presigned URL Upload (recommended — direct to S3, bypasses server)
//
//    Use this for ALL media types: profile pics, cover photos, posts, chat.
//
//    Flow:
//      1. getPresignedUrl()    → get a presigned S3 PUT URL from the backend
//      2. uploadToS3()         → PUT the file directly to S3 using that URL
//      3. confirmUpload()      → tell the backend to persist the CloudFront URL
//                                 (auto-updates User doc for profile/cover)
//
//    Quick usage:
//      const result = await uploadMediaDirect(fileUri, fileName, 'post');
//      // result.url  = CloudFront URL to store in MongoDB
//      // result.key  = S3 key for future deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Get a presigned S3 upload URL from the backend.
 *
 * @param fileName  Original file name (e.g. "photo.jpg")
 * @param fileType  MIME type (e.g. "image/jpeg")
 * @param folder    Media category: 'profile' | 'cover' | 'post' | 'chat'
 * @param ownerId   Optional override (e.g. chatId for chat media)
 */
export const getPresignedUrl = async (
  fileName: string,
  fileType: string,
  folder: MediaFolder = 'post',
  ownerId?: string
): Promise<PresignedUrlResponse> => {
  const params = new URLSearchParams({ fileName, fileType, folder });
  if (ownerId) params.append('ownerId', ownerId);

  return get(`/media/presigned-url?${params.toString()}`);
};

/**
 * Step 2: Upload a file directly to S3 using a presigned PUT URL.
 *
 * @param presignedUrl  The presigned URL from getPresignedUrl()
 * @param fileUri       Local file URI (from image/video picker)
 * @param fileType      MIME type (must match what was used for presigned URL)
 */
export const uploadToS3 = async (
  presignedUrl: string,
  fileUri: string,
  fileType: string
): Promise<void> => {
  // Fetch the local file as a blob for the PUT request
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed with status ${uploadResponse.status}`);
  }
};

/**
 * Step 3: Confirm upload with the backend.
 * For profile/cover, this auto-updates the User document in MongoDB.
 *
 * @param folder        Media category
 * @param key           S3 object key
 * @param cloudfrontUrl CloudFront URL
 * @param fileType      MIME type
 */
export const confirmUpload = async (
  folder: MediaFolder,
  key: string,
  cloudfrontUrl: string,
  fileType: string
): Promise<any> => {
  return post('/media/confirm-upload', { folder, key, cloudfrontUrl, fileType });
};

/**
 * All-in-one: Upload a file directly to S3 via presigned URL.
 * This is the recommended function for all media uploads.
 *
 * @param fileUri   Local file URI from image/video picker
 * @param fileName  Original file name (e.g. "photo.jpg")
 * @param folder    Media category: 'profile' | 'cover' | 'post' | 'chat'
 * @param ownerId   Optional override (e.g. chatId for chat media)
 * @returns         { url: CloudFront URL, key: S3 object key }
 *
 * @example
 *  // Upload a profile picture
 *  const { url, key } = await uploadMediaDirect(imageUri, 'avatar.jpg', 'profile');
 *
 *  // Upload a post image
 *  const { url, key } = await uploadMediaDirect(imageUri, 'sunset.jpg', 'post');
 *
 *  // Upload chat media
 *  const { url, key } = await uploadMediaDirect(fileUri, 'photo.png', 'chat', chatId);
 */
export const uploadMediaDirect = async (
  fileUri: string,
  fileName: string,
  folder: MediaFolder = 'post',
  ownerId?: string
): Promise<UploadResult> => {
  const fileType = getMimeType(fileUri);

  // 1. Get presigned URL from backend
  const { presignedUrl, key, cloudfrontUrl } = await getPresignedUrl(
    fileName,
    fileType,
    folder,
    ownerId
  );

  // 2. Upload directly to S3
  await uploadToS3(presignedUrl, fileUri, fileType);

  // 3. Confirm with backend (auto-updates User doc for profile/cover)
  await confirmUpload(folder, key, cloudfrontUrl, fileType);

  return { url: cloudfrontUrl, key };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Server-Proxied Upload (legacy — routes file through the backend)
//    Kept for backward compatibility with existing code that uses uploadMedia().
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploads a media file through the backend (multer-s3 → S3 → CloudFront URL).
 * For new code, prefer uploadMediaDirect() which uploads straight to S3.
 *
 * On web: Converts URI to File object for proper FormData serialization
 * On native: Uses native { uri, type, name } format
 *
 * @param fileUri  Local URI from image/video picker
 * @param fileName File name (e.g. "photo.jpg")
 * @returns `{ url, key }` — CloudFront URL and S3 object key
 */
export const uploadMedia = async (
  fileUri: string,
  fileName: string
): Promise<UploadResult> => {
  try {
    // Convert URI to proper format for FormData
    // On web: Creates a File object for multipart/form-data serialization
    // On native: Returns native { uri, type, name } object
    const fileData = await uriToFile(fileUri, fileName);

    const formData = new FormData();
    formData.append('media', fileData as any);

    // POST to multer-s3 upload endpoint
    const response = await post('/media/upload', formData);

    return {
      url: response.url,   // CloudFront URL — save as mediaUrl in DB
      key: response.key,   // S3 object key  — save as mediaKey in DB
    };
  } catch (error) {
    console.error('Error uploading media:', error);
    throw error;
  }
};
