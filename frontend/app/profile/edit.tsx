import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, TextInput, Alert, ActivityIndicator, FlatList, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { get, put } from '@/services/api';
import { uploadMedia } from '@/services/mediaService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function EditProfileScreen() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [pronouns, setPronouns] = useState('');

  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [newProfilePictureUri, setNewProfilePictureUri] = useState<string | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [newCoverPhotoUri, setNewCoverPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await get('/profile/me');
        setName(userData.name || '');
        setUsername(userData.username || '');
        setBio(userData.bio || '');
        setLocation(userData.location || '');
        setWebsite(userData.website || '');
        setPronouns(userData.pronouns || '');
        setProfilePicture(userData.profilePicture);
        setCoverPhoto(userData.coverPhoto);
      } catch (error) {
        Alert.alert('Error', 'Failed to load profile data.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // Debounced Location Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (location && showLocationSuggestions) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=5`, {
            headers: {
              'User-Agent': 'AstraChitChat/1.0'
            }
          });
          const data = await res.json();
          setLocationSuggestions(data);
        } catch (error) {
          console.error("Location fetch error", error);
        }
      } else {
        setLocationSuggestions([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [location, showLocationSuggestions]);

  const handleSelectLocation = (loc: any) => {
    setLocation(loc.display_name);
    setShowLocationSuggestions(false);
  };

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

  const handleChooseCoverPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9], // Landscape aspect ratio for cover
      quality: 0.7,
    });

    if (!result.canceled) {
      setNewCoverPhotoUri(result.assets[0].uri);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      let newProfilePictureUrl = profilePicture;
      let newCoverPhotoUrl = coverPhoto;

      // If a new image was selected, upload it first
      if (newProfilePictureUri) {
        const fileName = newProfilePictureUri.split('/').pop() || 'profile.jpg';
        const result = await uploadMedia(newProfilePictureUri, fileName);
        newProfilePictureUrl = result.url;
      }

      if (newCoverPhotoUri) {
        const fileName = newCoverPhotoUri.split('/').pop() || 'cover.jpg';
        const result = await uploadMedia(newCoverPhotoUri, fileName);
        newCoverPhotoUrl = result.url;
      }

      // Send updated data to the backend
      await put('/profile/me', {
        name,
        username,
        bio,
        location,
        website,
        pronouns,
        profilePicture: newProfilePictureUrl,
        coverPhoto: newCoverPhotoUrl,
      });

      Alert.alert('Success', 'Profile updated successfully!');
      router.dismiss(); // Dismiss modal
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
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.container}>

      {/* Cover Photo Selection */}
      <TouchableOpacity onPress={handleChooseCoverPhoto} style={styles.coverPhotoContainer}>
        {newCoverPhotoUri || coverPhoto ? (
          <Image source={{ uri: newCoverPhotoUri || coverPhoto || '' }} style={styles.coverPhoto} />
        ) : (
          <View style={[styles.coverPhoto, styles.coverPhotoPlaceholder]}>
            <ThemedText style={styles.placeholderText}>Add Cover Photo</ThemedText>
          </View>
        )}
      </TouchableOpacity>

      {/* Profile Picture Selection */}
      <TouchableOpacity onPress={handleChoosePhoto} style={styles.profileImageWrapper}>
        {(!newProfilePictureUri && (!profilePicture || profilePicture.includes('anonymous-avatar-icon') || profilePicture.includes('pravatar.cc'))) ? (
          <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee' }]}>
            <Ionicons name="person" size={50} color="#888" />
          </View>
        ) : (
          <Image
            source={{ uri: newProfilePictureUri || profilePicture || '' }}
            style={styles.profileImage}
          />
        )}
        <ThemedText style={styles.changePhotoText}>Change Photo</ThemedText>
      </TouchableOpacity>

      <ThemedText style={styles.label}>Name</ThemedText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
      />

      <ThemedText style={styles.label}>Username</ThemedText>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Enter your username"
      />

      <ThemedText style={styles.label}>Pronouns</ThemedText>
      <TextInput
        style={styles.input}
        value={pronouns}
        onChangeText={setPronouns}
        placeholder="e.g. they/them"
      />

      <ThemedText style={styles.label}>Website</ThemedText>
      <TextInput
        style={styles.input}
        value={website}
        onChangeText={setWebsite}
        placeholder="https://yourwebsite.com"
        autoCapitalize="none"
        keyboardType="url"
      />

      <ThemedText style={styles.label}>Location</ThemedText>
      <View style={styles.locationContainer}>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={(text) => {
            setLocation(text);
            setShowLocationSuggestions(true);
          }}
          placeholder="Search location..."
        />
        {showLocationSuggestions && locationSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {locationSuggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSelectLocation(item)}
              >
                <Text style={styles.suggestionText} numberOfLines={2}>{item.display_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  container: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 50,
  },
  coverPhotoContainer: {
    width: '100%',
    height: 80,
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: -20, // overlap effect
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
  },
  coverPhotoPlaceholder: {
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontWeight: 'bold',
  },
  profileImageWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 5,
  },
  changePhotoText: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 12,
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
    color: '#000',
    textAlignVertical: 'top',
  },
  locationContainer: {
    width: '100%',
    zIndex: 100, // ensure suggestions appear above other elements
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 50, // slightly below input
      left: 0, // shadow for ios
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionText: {
    color: '#000',
    fontSize: 14,
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
