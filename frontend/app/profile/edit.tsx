import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, put } from '@/services/api';
import { uploadMedia } from '@/services/mediaService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function EditProfileScreen() {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [newProfilePictureUri, setNewProfilePictureUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await get('/profile/me');
        setUsername(userData.username);
        setBio(userData.bio);
        setProfilePicture(userData.profilePicture);
      } catch (error) {
        Alert.alert('Error', 'Failed to load profile data.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

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

    if (!result.canceled) {
      setNewProfilePictureUri(result.assets[0].uri);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      let newProfilePictureUrl = profilePicture;

      // If a new image was selected, upload it first
      if (newProfilePictureUri) {
        const fileName = newProfilePictureUri.split('/').pop() || 'profile.jpg';
        newProfilePictureUrl = await uploadMedia(newProfilePictureUri, fileName);
      }

      // Send updated data to the backend
      await put('/profile/me', {
        username,
        bio,
        profilePicture: newProfilePictureUrl,
      });

      Alert.alert('Success', 'Profile updated successfully!');
      router.back(); // Go back to the profile screen
    } catch (error: any) {
      console.error('Save changes error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ThemedView style={styles.container}><ActivityIndicator size="large" /></ThemedView>;
  }

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity onPress={handleChoosePhoto}>
        <Image
          source={{ uri: newProfilePictureUri || profilePicture || 'https://i.pravatar.cc/150' }}
          style={styles.profileImage}
        />
        <ThemedText style={styles.changePhotoText}>Change Profile Photo</ThemedText>
      </TouchableOpacity>

      <ThemedText style={styles.label}>Username</ThemedText>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Enter your username"
      />

      <ThemedText style={styles.label}>Bio</ThemedText>
      <TextInput
        style={styles.input}
        value={bio}
        onChangeText={setBio}
        placeholder="Tell us about yourself"
        multiline
        numberOfLines={4}
      />

      <TouchableOpacity style={styles.saveButton} onPress={handleSaveChanges} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>}
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
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 10,
  },
  changePhotoText: {
    color: '#007AFF',
    marginBottom: 30,
    fontWeight: 'bold',
  },
  label: {
    alignSelf: 'flex-start',
    marginBottom: 5,
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
    backgroundColor: '#fff',
    color: '#000', // Explicitly set text color for consistency
    textAlignVertical: 'top', // For multiline input
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});