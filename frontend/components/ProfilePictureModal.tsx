import React, { useState } from 'react';
import { Modal, View, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { uploadMedia } from '@/services/mediaService';
import { put } from '@/services/api';

interface ProfilePictureModalProps {
  visible: boolean;
  uri: string | null;
  isEditable: boolean;
  onClose: () => void;
  onUpdate?: (newUri: string) => void;
}

export default function ProfilePictureModal({ visible, uri, isEditable, onClose, onUpdate }: ProfilePictureModalProps) {
  const [uploading, setUploading] = useState(false);

  const handleChoosePhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets[0].uri) {
      uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (fileUri: string) => {
    setUploading(true);
    try {
      const fileName = fileUri.split('/').pop() || 'profile.jpg';
      const uploadResult = await uploadMedia(fileUri, fileName);
      
      // Update backend profile
      await put('/profile/me', { profilePicture: uploadResult.url });
      
      if (onUpdate) {
        onUpdate(uploadResult.url);
      }
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Upload Error:', error);
      Alert.alert('Upload Failed', error.response?.data?.message || 'Could not upload profile picture.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {!uri || uri.includes('anonymous-avatar-icon') || uri.includes('pravatar.cc') ? (
              <View style={[styles.imagePlaceholder, styles.image]}>
                <Ionicons name="person" size={120} color="#888" />
              </View>
            ) : (
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            )}

            {isEditable && (
              <TouchableOpacity 
                 style={styles.changePhotoButton} 
                 onPress={handleChoosePhoto}
                 disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="camera" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <ThemedText style={styles.changePhotoText}>Change Photo</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  imagePlaceholder: {
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoButton: {
    marginTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    minWidth: 160,
    justifyContent: 'center',
  },
  changePhotoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
