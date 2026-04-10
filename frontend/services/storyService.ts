import { get, post, del } from '@/services/api';

interface TextOverlayData {
  id: string;
  text: string;
  fontSize: number;
  color: string;
  // NOTE: x, y, rotation are ephemeral and NOT persisted
  // Position/rotation are client-side UI concerns, not backend storage
}

interface UploadStoryPayload {
  mediaUrl: string;                    // Cloudinary secure_url
  mediaPublicId: string;               // Cloudinary public_id for deletion
  mediaType: 'image' | 'video';
  thumbnailUrl?: string;               // Optional: for videos
  duration?: number;                   // ✅ FIXED: video duration in SECONDS (not ms)
  textOverlay?: TextOverlayData[];      // Sanitized text overlays (text content only)
  drawings?: Array<any>;                // Optional: ephemeral drawing data
}

interface Story {
  _id: string;
  author: {
    _id: string;
    name: string;
    username: string;
    profilePicture: string;
  };
  media: {
    public_id: string;
    secure_url: string;
    resource_type: string;
    format: string;
    thumbnail_url?: string;
    duration?: number;
  };
  textOverlay: TextOverlayData[];
  createdAt: string;
  expiresAt: string;
  viewsCount: number;
}

/**
 * Upload a new story
 * 
 * @param payload Story upload data with cloud media URL and metadata
 * @returns Success response with created story
 */
export const uploadStory = async (
  payload: UploadStoryPayload
): Promise<{ success: boolean; data: Story; message: string }> => {
  return post('/stories', payload);
};

/**
 * Get stories feed from followed users
 */
export const getStoriesFeed = async (): Promise<{
  success: boolean;
  data: Story[];
}> => {
  return get('/stories/feed');
};

/**
 * Get user's stories
 */
export const getUserStories = async (
  userId: string
): Promise<{ success: boolean; data: Story[] }> => {
  return get(`/stories/user/${userId}`);
};

/**
 * Record a story view
 */
export const viewStory = async (storyId: string): Promise<{ success: boolean }> => {
  return post(`/stories/${storyId}/view`, {});
};

/**
 * Delete a story
 */
export const deleteStory = async (
  storyId: string
): Promise<{ success: boolean; message: string }> => {
  return del(`/stories/${storyId}`);
};

/**
 * Get story viewers
 */
export const getStoryViewers = async (
  storyId: string
): Promise<{ success: boolean; data: Array<any> }> => {
  return get(`/stories/${storyId}/viewers`);
};
