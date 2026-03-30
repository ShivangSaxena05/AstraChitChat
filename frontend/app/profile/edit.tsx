// FINAL PRODUCTION++ VERSION (Shimmer + Better UX)
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Text,
  Alert,
  Animated,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { get, put } from '@/services/api';
import { uploadMedia } from '@/services/mediaService';
import SaveToast from '@/components/SaveToast';
import { useTheme } from '@/hooks/use-theme-color';

export default function EditProfileScreen() {
  const colors = useTheme();
  const colorScheme = useColorScheme();
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [pronouns, setPronouns] = useState<string>('');

  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [newProfilePictureUri, setNewProfilePictureUri] = useState<string | null>(null);
  const [newProfilePictureUrl, setNewProfilePictureUrl] = useState<string | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [newCoverPhotoUri, setNewCoverPhotoUri] = useState<string | null>(null);
  const [newCoverPhotoUrl, setNewCoverPhotoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);

  const shimmer = useRef(new Animated.Value(0)).current;

  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const PRONOUN_OPTIONS = ['He/Him', 'She/Her', 'They/Them', 'Prefer not to say'];

  // shimmer animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();
  }, []);

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
      } catch {
        Alert.alert('Error', 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const pickImage = async (type: 'avatar' | 'cover') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'You need to grant permission to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'avatar' ? [1, 1] : [16, 9],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      if (type === 'avatar') {
        setNewProfilePictureUri(uri);
      } else {
        setNewCoverPhotoUri(uri);
      }

      setUploading(true);
      setUploadError(null);
      try {
        const fileName = `${type}_${Date.now()}.${uri.split('.').pop()}`;
        const res = await uploadMedia(uri, fileName);
        if (type === 'avatar') {
          setNewProfilePictureUrl(res.url);
        } else {
          setNewCoverPhotoUrl(res.url);
        }
      } catch (error) {
        setUploadError('Failed to upload image. Please try again.');
        console.error('Image upload error:', error);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      await put('/profile/me', {
        name,
        username,
        bio,
        location,
        website,
        pronouns,
        profilePicture: newProfilePictureUrl || profilePicture,
        coverPhoto: newCoverPhotoUrl || coverPhoto,
      });

      setShowToast(true);
      setTimeout(() => router.back(), 1200);
    } catch {
      Alert.alert('Error', 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });

    return (
      <View style={styles.skeletonContainer}>
        <Animated.View style={[styles.skeletonBlock, { opacity }]} />
        <Animated.View style={[styles.skeletonCircle, { opacity }]} />
        <Animated.View style={[styles.skeletonCard, { opacity }]} />
        <Animated.View style={[styles.skeletonCard, { opacity }]} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>

        <TouchableOpacity onPress={() => pickImage('cover')} style={styles.coverContainer}>
          {(newCoverPhotoUri || coverPhoto) && (
            <Image source={{ uri: (newCoverPhotoUri || coverPhoto) as string }} style={styles.cover} />
          )}
          {uploading && <ActivityIndicator style={styles.loader} />}
        </TouchableOpacity>

        <View style={styles.avatarWrapper}>
          <TouchableOpacity onPress={() => pickImage('avatar')}>
            {(newProfilePictureUri || profilePicture) ? (
              <Image source={{ uri: (newProfilePictureUri || profilePicture) as string }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={colors.iconSecondary} />
              </View>
            )}
            {uploading && <ActivityIndicator style={styles.avatarLoader} />}
          </TouchableOpacity>
        </View>

        {uploadError && <Text style={styles.errorText}>{uploadError}</Text>}

        <View style={styles.card}>
          <Text style={styles.section}>Basic Info</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Name" style={styles.input} />
          <TextInput value={username} onChangeText={setUsername} placeholder="Username" style={styles.input} />
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Pronouns</Text>
          <View style={styles.chipContainer}>
            {PRONOUN_OPTIONS.map((item) => (
              <TouchableOpacity key={item} style={[styles.chip, pronouns === item && styles.chipActive]} onPress={() => setPronouns(item)}>
                <Text style={[styles.chipText, pronouns === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>About</Text>
          <TextInput value={website} onChangeText={setWebsite} placeholder="Website" style={styles.input} />
          <TextInput value={location} onChangeText={setLocation} placeholder="Location" style={styles.input} />
          <TextInput value={bio} onChangeText={setBio} placeholder="Bio" style={[styles.input, { height: 90 }]} multiline />
        </View>

      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSaveChanges} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.card} /> : <Text style={styles.saveText}>Save Changes</Text>}
      </TouchableOpacity>

      <SaveToast visible={showToast} onHide={() => setShowToast(false)} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { padding: 16, paddingBottom: 120 },
  coverContainer: { height: 160, borderRadius: 20, backgroundColor: colors.backgroundSecondary, overflow: 'hidden' },
  cover: { width: '100%', height: '100%' },

  avatarWrapper: { alignItems: 'center', marginTop: -50, marginBottom: 10 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: colors.tint },
  avatarPlaceholder: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.backgroundSecondary, borderColor: colors.tint, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  card: { backgroundColor: colors.card, padding: 16, borderRadius: 18, marginBottom: 20 },
  section: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: colors.text },

  input: { backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 12, color: colors.text },

  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, backgroundColor: colors.backgroundSecondary },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.text },
  chipTextActive: { color: colors.background, fontWeight: 'bold' },

  saveBtn: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: colors.tint, padding: 14, borderRadius: 14, alignItems: 'center' },
  saveText: { color: colors.background, fontWeight: 'bold' },

  loader: { position: 'absolute', top: '50%', left: '50%' },
  avatarLoader: { position: 'absolute', top: '40%', left: '40%' },

  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 10,
  },

  skeletonContainer: { flex: 1, padding: 16 },
  skeletonBlock: { height: 160, backgroundColor: colors.backgroundSecondary, borderRadius: 20, marginBottom: 20 },
  skeletonCircle: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.backgroundSecondary, alignSelf: 'center', marginTop: -50, marginBottom: 20 },
  skeletonCard: { height: 120, backgroundColor: colors.backgroundSecondary, borderRadius: 16, marginBottom: 20 },
});

const styles = createStyles({} as any); // Placeholder