import { post } from './api';

/**
 * Uploads a media file to the local backend server.
 * @param fileUri The local URI of the file to upload (e.g., from an image picker).
 * @param fileName The name of the file.
 * @returns A promise that resolves to the URL of the uploaded file on the server.
 */
export const uploadMedia = async (fileUri: string, fileName: string): Promise<string> => {
  try {
    // Create FormData for file upload
    const formData = new FormData();

    // Determine the file type from the filename extension
    const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    let mimeType = 'image/jpeg';
    if (extension === 'png') mimeType = 'image/png';
    else if (extension === 'gif') mimeType = 'image/gif';
    else if (extension === 'webp') mimeType = 'image/webp';
    else if (extension === 'mp4') mimeType = 'video/mp4';

    // For React Native (native), use the object with uri, type, and name
    // For web, we need to fetch the file as a Blob
    if (typeof window !== 'undefined' && window.location.protocol === 'file:' || 
        fileUri.startsWith('http') || fileUri.startsWith('blob:')) {
      // Web environment - fetch the file as a Blob
      try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append('media', blob, fileName);
      } catch (fetchError) {
        // If fetch fails, try using the object approach (works on some web configs)
        formData.append('media', {
          uri: fileUri,
          type: mimeType,
          name: fileName,
        } as any);
      }
    } else {
      // React Native (native) - use the object with uri, type, and name
      formData.append('media', {
        uri: fileUri,
        type: mimeType,
        name: fileName,
      } as any);
    }

    // Post the FormData to your backend's upload endpoint.
    const response = await post('/media/upload', formData);

    // Return the URL of the uploaded file from the server's response.
    return response.url;
  } catch (error) {
    console.error('Error uploading media:', error);
    throw error;
  }
};
