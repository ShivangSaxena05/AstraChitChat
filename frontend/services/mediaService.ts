import { post } from './api'; // Import the post function from your api service

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

    // For React Native, append the file as an object with uri, type, and name
    formData.append('media', {
      uri: fileUri,
      type: 'image/jpeg', // Adjust based on file type if needed
      name: fileName,
    } as any);

    // Post the FormData to your backend's upload endpoint.
    const response = await post('/media/upload', formData);

    // Return the URL of the uploaded file from the server's response.
    return response.url;
  } catch (error) {
    console.error('Error uploading media:', error);
    throw error;
  }
};
