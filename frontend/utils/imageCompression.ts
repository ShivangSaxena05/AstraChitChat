import { Platform } from 'react-native';
// ✅ FIX: Use legacy API to avoid deprecation warning
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compress image to target dimensions and quality
 * @param uri Source image URI
 * @param targetWidth Target width (default 1200px)
 * @param targetHeight Target height (default 1200px)
 * @param quality Compression quality (0-1, default 0.8)
 * @returns Compressed image URI and file size
 */
export const compressImage = async (
  uri: string,
  targetWidth: number = 1200,
  targetHeight: number = 1200,
  quality: number = 0.8
): Promise<{ uri: string; size: number; originalSize: number }> => {
  try {
    // Get original file size
    const originalInfo = await FileSystem.getInfoAsync(uri);
    const originalSize = (originalInfo.exists && 'size' in originalInfo) ? originalInfo.size : 0;

    console.log(
      `[Image] Compressing: ${(originalSize / 1024 / 1024).toFixed(2)}MB`
    );

    // Use expo-image-manipulator to resize
    // This is the industry standard for React Native
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: targetWidth,
            height: targetHeight,
          },
        },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // Get compressed file size
    const compressedInfo = await FileSystem.getInfoAsync(result.uri);
    const compressedSize = (compressedInfo.exists && 'size' in compressedInfo) ? compressedInfo.size : 0;

    const compressionRatio = (
      ((originalSize - compressedSize) / originalSize) * 100
    ).toFixed(1);

    console.log(
      `[Image] Compressed: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ` +
      `${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`
    );

    return {
      uri: result.uri,
      size: compressedSize,
      originalSize,
    };
  } catch (error) {
    console.error('[Image] Compression failed:', error);
    // Fallback to original
    const info = await FileSystem.getInfoAsync(uri);
    const fileSize = (info.exists && 'size' in info) ? info.size : 0;
    return {
      uri,
      size: fileSize,
      originalSize: fileSize,
    };
  }
};

/**
 * Compress image for different use cases
 */
export const getCompressionSettings = (type: 'profile' | 'post' | 'cover' | 'thumbnail') => {
  switch (type) {
    case 'profile':
      return { targetWidth: 400, targetHeight: 400, quality: 0.85 };
    case 'post':
      return { targetWidth: 1080, targetHeight: 1080, quality: 0.80 };
    case 'cover':
      return { targetWidth: 1920, targetHeight: 1080, quality: 0.80 };
    case 'thumbnail':
      return { targetWidth: 200, targetHeight: 200, quality: 0.75 };
    default:
      return { targetWidth: 1200, targetHeight: 1200, quality: 0.80 };
  }
};
