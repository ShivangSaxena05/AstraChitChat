import { post } from './api';

/**
 * Detect MIME type from a file URI based on its extension.
 */
function getMimeType(uri: string): string {
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
  };
  return mimeMap[ext || ''] || 'application/octet-stream';
}

/**
 * Uploads a media file to the backend (multer-s3 → S3 → CloudFront URL).
 *
 * @param fileUri  Local URI from image/video picker
 * @param fileName File name (e.g. "photo.jpg")
 * @returns `{ url, key }` — CloudFront URL and S3 object key
 */
export const uploadMedia = async (
  fileUri: string,
  fileName: string
): Promise<{ url: string; key: string }> => {
  try {
    const formData = new FormData();
    formData.append('media', {
      uri: fileUri,
      type: getMimeType(fileUri),
      name: fileName,
    } as any);

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
