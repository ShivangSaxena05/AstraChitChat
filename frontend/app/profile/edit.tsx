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
  Pressable,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { get, put } from '@/services/api';
import { uploadProfilePicture } from '@/services/mediaService';
import SaveToast from '@/components/SaveToast';
import { useTheme } from '@/hooks/use-theme-color';
import { parseUploadError, parseSaveProfileError } from '@/utils/uploadErrorHandler';
import { compressImage, getCompressionSettings } from '@/utils/imageCompression';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [profilePublicId, setProfilePublicId] = useState<string | null>(null);
  const [newProfilePictureUri, setNewProfilePictureUri] = useState<string | null>(null);
  const [newProfilePictureUrl, setNewProfilePictureUrl] = useState<string | null>(null);
  const [newProfilePublicId, setNewProfilePublicId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);

  const entrance = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  const avatarGlow = useRef(new Animated.Value(0.6)).current;
  const saveBtnScale = useRef(new Animated.Value(1)).current;
  const card1Opacity = useRef(new Animated.Value(0)).current;
  const card2Opacity = useRef(new Animated.Value(0)).current;
  const card3Opacity = useRef(new Animated.Value(0)).current;

  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const PRONOUN_OPTIONS = ['He/Him', 'She/Her', 'They/Them', 'Prefer not to say'];

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.timing(entrance, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(avatarGlow, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(avatarGlow, {
          toValue: 0.6,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.stagger(150, [
      Animated.timing(card1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(card2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(card3Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
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
        setProfilePublicId(userData.profilePublicId || null);
      } catch {
        Alert.alert('Error', 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const handleAvatarPress = () => {
    Animated.sequence([
      Animated.timing(avatarScale, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
    pickImage('avatar');
  };

  const handleSavePress = () => {
    Animated.sequence([
      Animated.timing(saveBtnScale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.spring(saveBtnScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
    handleSaveChanges();
  };

  const pickImage = async (type: 'avatar') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'You need to grant permission to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setNewProfilePictureUri(uri);

      setUploading(true);
      setUploadError(null);
      try {
        const settings = getCompressionSettings('profile');
        const { uri: compressedUri, size: compressedSize, originalSize } = await compressImage(
          uri,
          settings.targetWidth,
          settings.targetHeight,
          settings.quality
        );

        const maxSize = 1024 * 1024;
        if (compressedSize > maxSize) {
          const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
          Alert.alert(
            'File Too Large',
            `Compressed image is still ${(compressedSize / 1024 / 1024).toFixed(2)}MB. ` +
            `Please choose a smaller image (max ${maxSizeMB}MB).`
          );
          setUploading(false);
          return;
        }

        console.log(
          `[Profile] Compression: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ` +
          `${(compressedSize / 1024 / 1024).toFixed(2)}MB`
        );

        const fileName = `profile_${Date.now()}.jpg`;
        const { url, publicId } = await uploadProfilePicture(compressedUri, fileName);
        
        setNewProfilePictureUrl(url);
        setNewProfilePublicId(publicId);
      } catch (error: any) {
        console.error('Image upload error:', error);
        
        const { message } = parseUploadError(error);
        setUploadError(message);
        
        setTimeout(() => {
          setUploadError(null);
        }, 5000);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const profilePictureData = newProfilePublicId && newProfilePictureUrl
        ? {
            public_id: newProfilePublicId,
            secure_url: newProfilePictureUrl,
            resource_type: 'image',
            version: Math.floor(Date.now() / 1000),
          }
        : newProfilePictureUrl
        ? newProfilePictureUrl
        : profilePicture;

      await put('/profile/me', {
        name,
        username,
        bio,
        location,
        website,
        pronouns,
        profilePicture: profilePictureData,
        profilePublicId: newProfilePublicId || profilePublicId,
      });

      setShowToast(true);
      setTimeout(() => router.back(), 1200);
    } catch (error: any) {
      console.error('Save profile error:', error);
      
      const { title, message } = parseSaveProfileError(error);
      Alert.alert(title, message, [
        {
          text: 'OK',
          onPress: () => setSaving(false),
        },
      ]);
    }
  };

  const avatarAnimatedStyle = {
    transform: [{ scale: avatarScale }],
  };

  const glowAnimatedStyle = {
    opacity: avatarGlow,
    transform: [
      { scale: avatarGlow.interpolate({ inputRange: [0.6, 1], outputRange: [1, 1.12] }) },
    ],
  };

  const saveBtnAnimatedStyle = {
    transform: [{ scale: saveBtnScale }],
  };

  const containerAnimatedStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [25, 0] }),
      },
    ],
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <View style={styles.loadingAvatarWrapper}>
          <Animated.View style={styles.loadingAvatar} />
        </View>
        <View style={styles.loadingCard}>
          <Animated.View style={styles.loadingLine} />
          <Animated.View style={[styles.loadingLine, { width: '60%' }]} />
        </View>
        <View style={styles.loadingCard}>
          <Animated.View style={[styles.loadingLine, { width: '40%' }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.heroBackground}>
        <View style={styles.heroOrbOne} />
        <View style={styles.heroOrbTwo} />
        <View style={styles.heroOrbThree} />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        style={containerAnimatedStyle}
      >
        <View style={styles.heroHeader}>
          <View style={styles.kickerContainer}>
            <Ionicons name="sparkles" size={12} color={colors.tint} />
            <Text style={styles.kicker}>Profile Studio</Text>
          </View>
          <Text style={styles.heroTitle}>Make it uniquely yours</Text>
          <Text style={styles.heroSubtitle}>
            Add your personal touch and let your personality shine through
          </Text>
        </View>

        <Animated.View style={[styles.avatarSection, { opacity: card1Opacity }]}>
          <Pressable onPress={handleAvatarPress}>
            <Animated.View style={[styles.avatarWrapper, avatarAnimatedStyle]}>
              <Animated.View style={[styles.avatarGlow, glowAnimatedStyle]} />
              {(newProfilePictureUri || profilePicture) ? (
                <Image source={{ uri: (newProfilePictureUri || profilePicture) as string }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={colors.iconSecondary} />
                </View>
              )}
              <View style={styles.avatarOverlay}>
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color="#ffffff" />
                </View>
              </View>
              {uploading && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color={colors.tint} />
                </View>
              )}
            </Animated.View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Animated.View>

        {uploadError && (
          <Animated.View style={styles.errorCard}>
            <Ionicons name="warning-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{uploadError}</Text>
          </Animated.View>
        )}

        <Animated.View style={[styles.card, { opacity: card1Opacity }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBg}>
              <Ionicons name="person-outline" size={16} color={colors.tint} />
            </View>
            <Text style={styles.cardTitle}>About You</Text>
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Display Name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="@username"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: card2Opacity }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBg}>
              <Ionicons name="heart-outline" size={16} color={colors.tint} />
            </View>
            <Text style={styles.cardTitle}>Pronouns</Text>
          </View>
          <View style={styles.chipContainer}>
            {PRONOUN_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.chip,
                  pronouns === item && styles.chipActive,
                ]}
                onPress={() => setPronouns(item)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    pronouns === item && styles.chipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: card3Opacity }]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBg}>
              <Ionicons name="location-outline" size={16} color={colors.tint} />
            </View>
            <Text style={styles.cardTitle}>Details</Text>
          </View>
          <TextInput
            value={website}
            onChangeText={setWebsite}
            placeholder="Website"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Location"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself..."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.bioInput]}
            multiline
            textAlignVertical="top"
          />
        </Animated.View>

        <View style={{ height: 120 }} />
      </Animated.ScrollView>

      <View style={styles.footerBar}>
        <Animated.View style={saveBtnAnimatedStyle}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSavePress}
            disabled={saving}
            activeOpacity={1}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.saveBtnContent}>
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.saveText}>Save Profile</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      <SaveToast visible={showToast} onHide={() => setShowToast(false)} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 40,
  },
  loadingAvatarWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.backgroundSecondary,
  },
  loadingCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    height: 90,
    justifyContent: 'center',
  },
  loadingLine: {
    height: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    marginBottom: 8,
  },

  container: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 24,
  },

  heroBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 300,
    overflow: 'hidden',
  },
  heroOrbOne: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: `${colors.tint}08`,
    top: -90,
    right: -80,
  },
  heroOrbTwo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: `${colors.tint}06`,
    top: 40,
    left: -60,
  },
  heroOrbThree: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${colors.accent}10`,
    top: 120,
    right: 30,
  },

  heroHeader: {
    marginBottom: 24,
  },
  kickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.tint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    maxWidth: 300,
  },

  avatarSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: `${colors.tint}20`,
  },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: colors.card,
  },
  avatarPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.border,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  cameraBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.card,
  },
  uploadingOverlay: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: `${colors.background}dd`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarHint: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${colors.error}12`,
    borderWidth: 1,
    borderColor: `${colors.error}25`,
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${colors.tint}12`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },

  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontWeight: '500',
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 14,
    marginBottom: 0,
  },

  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  footerBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  saveBtn: {
    backgroundColor: colors.tint,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.tint,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});