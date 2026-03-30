import { PermissionsAndroid, Platform, Alert } from 'react-native';

/**
 * ✅ FIX 3.5: Request permissions before making calls
 */
export const requestCallPermissions = async (
  isVideo: boolean = false
): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // Web handles permissions via browser
    return true;
  }

  if (Platform.OS === 'ios') {
    // iOS permissions are requested automatically when needed
    // Return true as we cannot programmatically request
    return true;
  }

  // Android-specific permissions
  try {
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];

    if (isVideo) {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      Alert.alert(
        'Permissions Required',
        `This app needs microphone ${isVideo ? 'and camera' : ''} access to make calls. ` +
        'Please enable these permissions in Settings.',
        [{ text: 'OK' }]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[PermissionManager] Error requesting permissions:', error);
    return false;
  }
};

/**
 * Request photo/video library permissions
 */
export const requestMediaLibraryPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      return true;
    }

    // For React Native, we would use expo-media-library
    // This is a placeholder for the implementation
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      const { status } = await (require('expo-media-library')).requestPermissionsAsync();
      return status === 'granted';
    }

    return true;
  } catch (error) {
    console.error('[PermissionManager] Error requesting media library permissions:', error);
    return false;
  }
};
