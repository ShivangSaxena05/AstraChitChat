import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme-color';
import { isModuleMissing, getMissingModuleMessage } from '@/services/nativeModuleFallback';
import * as ImagePicker from 'expo-image-picker';

interface SafeCameraWrapperProps {
  onCameraReady?: () => void;
  onError?: (error: Error) => void;
  children?: React.ReactNode;
  fallbackComponent?: React.ReactNode;
}

/**
 * Safe Camera Wrapper
 * 
 * Provides graceful fallback when ExpoCamera native module is missing
 * Allows users to upload from gallery instead
 */
export const SafeCameraWrapper: React.FC<SafeCameraWrapperProps> = ({
  onCameraReady,
  onError,
  children,
  fallbackComponent,
}) => {
  const colors = useTheme();
  const [cameraMissing, setCameraMissing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any>(null);

  useEffect(() => {
    // Check if camera module is missing
    if (isModuleMissing('ExpoCamera')) {
      setCameraMissing(true);
      onError?.(new Error('Camera module not available'));
    } else {
      onCameraReady?.();
    }
  }, []);

  if (cameraMissing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.contentContainer}>
          <Ionicons 
            name="close-circle" 
            size={48} 
            color={colors.tint}
            style={styles.icon}
          />
          
          <Text style={[styles.title, { color: colors.text }]}>
            Camera Unavailable
          </Text>
          
          <Text style={[styles.message, { color: colors.textMuted }]}>
            {getMissingModuleMessage('ExpoCamera')}
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={openGallery}
            activeOpacity={0.8}
          >
            <Ionicons name="images" size={20} color="white" />
            <Text style={styles.buttonText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.tint }]}
            onPress={goBack}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color={colors.tint} />
            <Text style={[styles.secondaryButtonText, { color: colors.tint }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children || fallbackComponent}</>;
};

async function openGallery() {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      // Handle selected image
      console.log('[SafeCameraWrapper] Image selected:', result.assets[0].uri);
    }
  } catch (error) {
    console.error('[SafeCameraWrapper] Error opening gallery:', error);
  }
}

function goBack() {
  // Navigate back or close modal
  console.log('[SafeCameraWrapper] Going back...');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contentContainer: {
    alignItems: 'center',
    width: '100%',
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
