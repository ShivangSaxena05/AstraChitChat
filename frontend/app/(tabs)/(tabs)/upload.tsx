import React, { useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { post } from '@/services/api';
import { uploadMedia } from '@/services/mediaService';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface MediaAsset {
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  width: number;
  height: number;
  duration?: number;
}

interface UploadOption {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  action: () => void;
}

export default function UploadScreen() {
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const colorScheme = useColorScheme();
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pickFromLibrary = async (mediaType: 'images' | 'videos' | 'all') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload media.');
      return;
    }

    const mediaTypes = mediaType === 'all' ? ['images', 'videos'] : [mediaType];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaTypes as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        fileName: asset.fileName || `upload_${Date.now()}.${asset.uri.split('.').pop()}`,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
      });
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        type: 'image',
        fileName: `photo_${Date.now()}.jpg`,
        width: asset.width,
        height: asset.height,
      });
    }
  };

  const recordVideo = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to record videos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        type: 'video',
        fileName: `video_${Date.now()}.mp4`,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedMedia) {
      Alert.alert('No Media Selected', 'Please select a photo or video to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      // Upload media to S3
      const { url: mediaUrl, key: mediaKey } = await uploadMedia(
        selectedMedia.uri,
        selectedMedia.fileName ?? `upload_${Date.now()}.${selectedMedia.uri.split('.').pop()}`
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Create post
      await post('/posts/upload', {
        mediaUrl,
        mediaKey,
        mediaType: selectedMedia.type,
        caption: caption.trim(),
      });

      Alert.alert(
        'Posted!',
        'Your post has been shared successfully.',
        [
          {
            text: 'View Profile',
            onPress: () => router.push('/(tabs)/(tabs)/profile'),
          },
          {
            text: 'Create Another',
            onPress: () => {
              setSelectedMedia(null);
              setCaption('');
            },
          },
        ]
      );

      setSelectedMedia(null);
      setCaption('');
    } catch (error: any) {
      Alert.alert('Upload Failed', error.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const clearMedia = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    setSelectedMedia(null);
  };

  const uploadOptions: UploadOption[] = [
    {
      id: 'gallery',
      icon: 'images',
      title: 'Photo Library',
      subtitle: 'Choose from your gallery',
      color: '#4ADDAE',
      action: () => pickFromLibrary('images'),
    },
    {
      id: 'camera',
      icon: 'camera',
      title: 'Take Photo',
      subtitle: 'Use your camera',
      color: '#007AFF',
      action: takePhoto,
    },
    {
      id: 'video-library',
      icon: 'videocam',
      title: 'Video Library',
      subtitle: 'Choose a video',
      color: '#FF6B6B',
      action: () => pickFromLibrary('videos'),
    },
    {
      id: 'record',
      icon: 'recording',
      title: 'Record Video',
      subtitle: 'Record up to 60 seconds',
      color: '#9B59B6',
      action: recordVideo,
    },
  ];

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#e5e5ea',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 100,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colorScheme === 'dark' ? '#888' : '#666',
      marginBottom: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    optionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    optionCard: {
      width: (width - 52) / 2,
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f8f8f8',
      borderRadius: 20,
      padding: 20,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#2c2c2e' : '#e5e5ea',
    },
    optionIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    optionTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    optionSubtitle: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#888' : '#666',
    },
    previewSection: {
      marginBottom: 24,
    },
    previewContainer: {
      position: 'relative',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f0f0f0',
    },
    previewMedia: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 20,
    },
    clearButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    mediaTypeIndicator: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
    },
    mediaTypeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    captionSection: {
      marginBottom: 24,
    },
    captionContainer: {
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f8f8f8',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#2c2c2e' : '#e5e5ea',
      overflow: 'hidden',
    },
    captionInput: {
      padding: 16,
      fontSize: 16,
      color: colorScheme === 'dark' ? '#fff' : '#000',
      minHeight: 120,
      textAlignVertical: 'top',
    },
    captionFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colorScheme === 'dark' ? '#333' : '#e5e5ea',
    },
    charCount: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#666' : '#999',
    },
    emojiButton: {
      padding: 4,
    },
    uploadButton: {
      backgroundColor: '#4ADDAE',
      borderRadius: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    uploadButtonDisabled: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#ccc',
    },
    uploadButtonText: {
      color: '#000',
      fontSize: 16,
      fontWeight: '700',
    },
    uploadButtonTextDisabled: {
      color: colorScheme === 'dark' ? '#666' : '#999',
    },
    progressContainer: {
      marginTop: 16,
    },
    progressBar: {
      height: 4,
      backgroundColor: colorScheme === 'dark' ? '#333' : '#e5e5ea',
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#4ADDAE',
      borderRadius: 2,
    },
    progressText: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#888' : '#666',
      textAlign: 'center',
      marginTop: 8,
    },
    emptyPreview: {
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
      borderRadius: 20,
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f8f8f8',
    },
    emptyPreviewIcon: {
      marginBottom: 12,
    },
    emptyPreviewText: {
      fontSize: 16,
      fontWeight: '600',
      color: colorScheme === 'dark' ? '#fff' : '#000',
      marginBottom: 4,
    },
    emptyPreviewSubtext: {
      fontSize: 13,
      color: colorScheme === 'dark' ? '#666' : '#999',
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Create Post</ThemedText>
          {selectedMedia && (
            <TouchableOpacity onPress={handleUpload} disabled={uploading}>
              <ThemedText style={{ color: '#4ADDAE', fontSize: 16, fontWeight: '600' }}>
                {uploading ? 'Posting...' : 'Post'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Upload Options */}
          {!selectedMedia && (
            <>
              <ThemedText style={styles.sectionTitle}>Choose Source</ThemedText>
              <View style={styles.optionsGrid}>
                {uploadOptions.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.optionCard}
                    onPress={option.action}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.optionIconContainer, { backgroundColor: `${option.color}20` }]}>
                      <Ionicons name={option.icon as any} size={24} color={option.color} />
                    </View>
                    <ThemedText style={styles.optionTitle}>{option.title}</ThemedText>
                    <ThemedText style={styles.optionSubtitle}>{option.subtitle}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Empty Preview Placeholder */}
              <ThemedText style={styles.sectionTitle}>Preview</ThemedText>
              <View style={styles.emptyPreview}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={48}
                  color={colorScheme === 'dark' ? '#444' : '#ccc'}
                  style={styles.emptyPreviewIcon}
                />
                <ThemedText style={styles.emptyPreviewText}>No media selected</ThemedText>
                <ThemedText style={styles.emptyPreviewSubtext}>Choose from options above</ThemedText>
              </View>
            </>
          )}

          {/* Media Preview */}
          {selectedMedia && (
            <>
              <ThemedText style={styles.sectionTitle}>Preview</ThemedText>
              <View style={styles.previewSection}>
                <Animated.View style={[styles.previewContainer, { transform: [{ scale: scaleAnim }] }]}>
                  {selectedMedia.type === 'image' ? (
                    <Image source={{ uri: selectedMedia.uri }} style={styles.previewMedia} resizeMode="cover" />
                  ) : (
                    <Video
                      source={{ uri: selectedMedia.uri }}
                      style={styles.previewMedia}
                      resizeMode={ResizeMode.COVER}
                      isLooping
                      shouldPlay
                      isMuted={false}
                      useNativeControls
                    />
                  )}

                  <TouchableOpacity style={styles.clearButton} onPress={clearMedia}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>

                  <View style={styles.mediaTypeIndicator}>
                    <Ionicons
                      name={selectedMedia.type === 'image' ? 'image' : 'videocam'}
                      size={14}
                      color="#fff"
                    />
                    <ThemedText style={styles.mediaTypeText}>
                      {selectedMedia.type === 'image' ? 'Photo' : 'Video'}
                      {selectedMedia.duration ? ` • ${Math.round(selectedMedia.duration / 1000)}s` : ''}
                    </ThemedText>
                  </View>
                </Animated.View>
              </View>

              {/* Caption Input */}
              <ThemedText style={styles.sectionTitle}>Caption</ThemedText>
              <View style={styles.captionSection}>
                <View style={styles.captionContainer}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Write a caption..."
                    placeholderTextColor={colorScheme === 'dark' ? '#666' : '#999'}
                    value={caption}
                    onChangeText={setCaption}
                    multiline
                    maxLength={2200}
                  />
                  <View style={styles.captionFooter}>
                    <ThemedText style={styles.charCount}>{caption.length}/2200</ThemedText>
                    <TouchableOpacity style={styles.emojiButton}>
                      <Ionicons name="happy-outline" size={24} color={colorScheme === 'dark' ? '#666' : '#999'} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Upload Button */}
              <TouchableOpacity
                style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}
                activeOpacity={0.8}
              >
                {uploading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color="#000" />
                    <ThemedText style={styles.uploadButtonText}>Share Post</ThemedText>
                  </>
                )}
              </TouchableOpacity>

              {/* Upload Progress */}
              {uploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <ThemedText style={styles.progressText}>Uploading... {uploadProgress}%</ThemedText>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
