import { Image, Platform } from 'react-native';

/**
 * Image Cache Manager for Android
 * Handles preloading and caching of remote images
 * iOS handles caching automatically, but Android needs explicit management
 */

/**
 * Preload an image to cache (Android optimization)
 * @param url - The image URL to preload
 */
export const preloadImage = async (url: string): Promise<void> => {
  // Only preload on Android - iOS handles this automatically
  if (Platform.OS !== 'android') return;

  try {
    await Image.prefetch(url);
  } catch (error) {
    console.warn('[ImageCache] Prefetch failed for:', url, error);
  }
};

/**
 * Preload multiple images in parallel
 * @param urls - Array of image URLs to preload
 */
export const preloadImages = async (urls: string[]): Promise<void> => {
  if (Platform.OS !== 'android' || urls.length === 0) return;

  try {
    await Promise.allSettled(urls.map((url) => Image.prefetch(url)));
  } catch (error) {
    console.warn('[ImageCache] Batch prefetch failed:', error);
  }
};

/**
 * Validate if a URL is cacheable
 * @param url - URL to validate
 * @returns true if the URL should be cached
 */
export const isCacheableUrl = (url: string): boolean => {
  // Ensure it's a valid HTTP(S) URL
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  // Don't cache data URLs or local files
  if (url.startsWith('data:')) return false;
  if (url.startsWith('file://')) return false;

  return true;
};
