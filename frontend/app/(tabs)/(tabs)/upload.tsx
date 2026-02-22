import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, Image, TextInput, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { post } from '@/services/api';
import { uploadMedia } from '@/services/mediaService';

interface MediaAsset {
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  width: number;
  height: number;
}

export default function UploadScreen() {
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const pickFromLibrary = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [ImagePicker.MediaType.Images, ImagePicker.MediaType.Videos],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedMedia(result.assets[0] as MediaAsset);
    }
  };

  const takeMedia = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission required', 'Permission to access the camera is required!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: [ImagePicker.MediaType.Images, ImagePicker.MediaType.Videos],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedMedia(result.assets[0] as MediaAsset);
    }
  };

  const handleSelectMedia = () => {
    Alert.alert(
      'Select Media',
      'Choose an option',
      [
        { text: 'Take Photo or Video', onPress: takeMedia },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleUpload = async () => {
    if (!selectedMedia) {
      Alert.alert('Error', 'Please select a media file');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload media to your local server
      // The expo-image-picker provides a fileName, which is what our backend needs.
      const mediaUrl = await uploadMedia(
        selectedMedia.uri,
        selectedMedia.fileName ?? `upload.${selectedMedia.uri.split('.').pop()}` // Fallback for filename
      );

      // Create post via API
      await post('/posts/upload', {
        mediaUrl,
        mediaType: selectedMedia.type === 'image' ? 'image' : 'video',
        caption,
      });

      Alert.alert('Success', 'Post uploaded successfully!');
      setSelectedMedia(null);
      setCaption('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Create Post</ThemedText>
      
      <TouchableOpacity style={styles.selectButton} onPress={handleSelectMedia}>
        <ThemedText style={styles.selectButtonText}>
          {selectedMedia ? 'Change Media' : 'Select Media'}
        </ThemedText>
      </TouchableOpacity>

      {selectedMedia && (
        <View style={styles.mediaPreview}>
          {selectedMedia.type === 'image' ? (
            <Image source={{ uri: selectedMedia.uri }} style={styles.previewImage} />
          ) : selectedMedia.type === 'video' ? (
            <Video
              source={{ uri: selectedMedia.uri }}
              style={styles.previewImage}
              resizeMode={ResizeMode.CONTAIN}
              isLooping
              shouldPlay
            />
          ) : (
            <ThemedText style={styles.previewText}>Unsupported media type</ThemedText>
          )}
        </View>
      )}

      <TextInput style={styles.captionInput} placeholder="Write a caption..." value={caption} onChangeText={setCaption} />

      <TouchableOpacity style={styles.uploadButton} onPress={handleUpload} disabled={uploading}>
        {uploading ? <ActivityIndicator color="#fff" /> :
          <ThemedText style={styles.uploadButtonText}>Upload Post</ThemedText>
        }
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    marginBottom: 20,
  },
  selectButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mediaPreview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  captionInput: {
    width: '100%',
    height: 100,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  uploadButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    opacity: 1, // Ensure button is not transparent by default
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
