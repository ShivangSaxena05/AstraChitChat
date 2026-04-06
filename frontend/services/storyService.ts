import { get, post, del } from '@/services/api';

interface UploadStoryPayload {
  mediaUrl: string;
  mediaKey?: string;
  mediaType: 'image' | 'video';
  duration?: number;
  textOverlay?: Array<any>;
  drawings?: Array<any>;
}

interface Story {
  _id: string;
  user: {
    _id: string;
    name: string;
    username: string;
    profilePicture: string;
  };
  mediaUrl: string;
  mediaType: string;
  textOverlay: Array<any>;
  viewers: Array<any>;
  createdAt: string;
  expiresAt: string;
}

/**
 * Upload a new story
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
