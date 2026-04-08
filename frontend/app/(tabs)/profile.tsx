import TopHeaderComponent from '@/components/TopHeaderComponent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme-color';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Share, StyleSheet, TouchableOpacity, View, useColorScheme, Animated, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProfilePictureModal from '@/components/ProfilePictureModal';
import ExpandableBio from '@/components/ExpandableBio';
import { useSocket } from '@/contexts/SocketContext';
import ProfileMenu from '@/components/ProfileMenu';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import { Fonts } from '@/constants/theme';

interface UserProfile {
  _id: string;
  username: string;
  name?: string;
  profilePicture: string;
  bio: string;
  location?: string;
  website?: string;
  pronouns?: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
    likes: number;
  };
}

interface UserPost {
  _id: string;
  mediaUrl: string;
  mediaType: string;
}

type TabType = 'posts' | 'videos' | 'reels';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 4) / 3;

// Helper function to format large numbers
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
};

function PressScaleCard({
  children,
  onPress,
  style,
  activeOpacity = 0.9,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  activeOpacity?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 18, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 0 }).start()}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const heroReveal = useRef(new Animated.Value(0)).current;
  const statsReveal = useRef(new Animated.Value(0)).current;
  const aboutReveal = useRef(new Animated.Value(0)).current;
  const actionReveal = useRef(new Animated.Value(0)).current;
  const glowFloat = useRef(new Animated.Value(0)).current;
  const avatarPulse = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = useTheme();
  const { socket } = useSocket();
  const { handleError } = useErrorHandler();
  const isDark = colorScheme === 'dark';
  const luxuryPalette = useMemo(() => ({
    heroBase: isDark ? '#0f1620' : '#e9edf4',
    heroGlowPrimary: isDark ? 'rgba(0, 212, 255, 0.20)' : 'rgba(10, 126, 164, 0.18)',
    heroGlowSecondary: isDark ? 'rgba(81, 207, 102, 0.10)' : 'rgba(56, 142, 60, 0.10)',
    gold: '#c8a96b',
    deep: isDark ? '#0c1118' : '#f7f8fb',
  }), [isDark]);


  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          const [userData, postsData] = await Promise.all([
            get('/profile/me'),
            get('/posts/me'),
          ]);
          setUser(userData);
          setPosts(postsData.posts);
        } catch (error: any) {
          // Handle error (auth errors will redirect automatically)
          const errorMessage = await handleError(error);
          if (errorMessage) {
            // Only show alert for non-auth errors
            Alert.alert('Error', errorMessage);
          }
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [handleError])
  );

  // Real-Time Socket WebHooks for Follower Count
  React.useEffect(() => {
    if (!socket || !user?._id) return;
    
    const handleStatsUpdate = (data: any) => {
      if (data.userId === user._id) {
        setUser(prev => {
          if (!prev) return prev;
          let newStats = { ...prev.stats };
          if (data.followersCount !== undefined) newStats.followers = data.followersCount;
          if (data.followingCount !== undefined) newStats.following = data.followingCount;
          return { ...prev, stats: newStats };
        });
      }
    };

    socket.on('profileStatsUpdated', handleStatsUpdate);
    return () => {
      socket.off('profileStatsUpdated', handleStatsUpdate);
    };
  }, [socket, user?._id]);

  useEffect(() => {
    if (!user) return;

    heroReveal.setValue(0);
    statsReveal.setValue(0);
    aboutReveal.setValue(0);
    actionReveal.setValue(0);

    const revealSequence = Animated.sequence([
      Animated.timing(heroReveal, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(statsReveal, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(aboutReveal, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(actionReveal, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowFloat, { toValue: 1, duration: 5200, useNativeDriver: true }),
        Animated.timing(glowFloat, { toValue: 0, duration: 5200, useNativeDriver: true }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarPulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(avatarPulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );

    revealSequence.start();
    glowLoop.start();
    pulseLoop.start();

    return () => {
      glowLoop.stop();
      pulseLoop.stop();
    };
  }, [user, heroReveal, statsReveal, aboutReveal, actionReveal, glowFloat, avatarPulse]);

  const handleShareProfile = async () => {
    if (!user) return;

    const profileUrl = `https://astra.app/profile/${user.username}`;
    const shareMessage = user.name
      ? `Check out ${user.name} (@${user.username}) on Astra!\n\n${user.bio ? `"${user.bio.substring(0, 100)}${user.bio.length > 100 ? '...' : ''}"\n\n` : ''}${profileUrl}`
      : `Check out @${user.username} on Astra!\n\n${user.bio ? `"${user.bio.substring(0, 100)}${user.bio.length > 100 ? '...' : ''}"\n\n` : ''}${profileUrl}`;

    try {
      // Check if we're on web and Web Share API is available
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${user.name || user.username}'s Profile`,
          text: shareMessage,
          url: profileUrl,
        });
      } else if (Platform.OS === 'web') {
        // Fallback for web browsers without Share API - copy to clipboard
        await navigator.clipboard.writeText(`${shareMessage}`);
        Alert.alert('Success', 'Profile link copied to clipboard!');
      } else {
        // Native Share API
        const result = await Share.share({
          message: shareMessage,
          url: profileUrl,
          title: `${user.name || user.username}'s Profile`,
        });

        if (result.action === Share.sharedAction) {
          if (result.activityType) {
            console.log('Shared with activity type:', result.activityType);
          }
        }
      }
    } catch (error: any) {
      if (error.message !== 'User did not share' && error.name !== 'AbortError') {
        console.error('Share error:', error);
      }
    }
  };

  const getFilteredPosts = () => {
    switch (activeTab) {
      case 'posts':
        return posts.filter(post => post.mediaType === 'image');
      case 'videos':
        return posts.filter(post => post.mediaType === 'video');
      case 'reels':
        return posts.filter(post => post.mediaType === 'reel');
      default:
        return posts;
    }
  };

  const renderPostItem = ({ item, index }: { item: UserPost; index: number }) => (
    <TouchableOpacity style={styles.gridItem} activeOpacity={0.85}>
      <Image source={{ uri: item.mediaUrl }} style={styles.gridImage} />
      {item.mediaType === 'video' && (
        <View style={styles.mediaIndicator}>
          <Ionicons name="play-circle" size={24} color={colors.background} />
        </View>
      )}
      {item.mediaType === 'reel' && (
        <View style={styles.mediaIndicator}>
          <Ionicons name="film" size={20} color={colors.background} />
        </View>
      )}
      <View style={styles.gridItemOverlay} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons
          name={activeTab === 'posts' ? 'camera-outline' : activeTab === 'videos' ? 'videocam-outline' : 'film-outline'}
          size={48}
          color={colors.iconMuted}
        />
      </View>
      <ThemedText style={styles.emptyTitle}>
        {activeTab === 'posts' && 'No Posts Yet'}
        {activeTab === 'videos' && 'No Videos Yet'}
        {activeTab === 'reels' && 'No Reels Yet'}
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        {activeTab === 'posts' && 'Share your first photo with the world'}
        {activeTab === 'videos' && 'Upload your first video'}
        {activeTab === 'reels' && 'Create your first reel'}
      </ThemedText>
    </View>
  );

  const HEADER_MAX_HEIGHT = 180;

  const heroCardTranslateY = scrollY.interpolate({
    inputRange: [0, 160],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });

  const heroCardScale = scrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [1, 0.985],
    extrapolate: 'clamp',
  });

  const heroBackdropShift = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, -24],
    extrapolate: 'clamp',
  });

  const floatingGlowY = glowFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [-4, 6],
  });

  const floatingGlowX = glowFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 10],
  });

  const pulseScale = avatarPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const pulseOpacity = avatarPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.12],
  });

  const openWebsite = (url: string) => {
    let finalUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      finalUrl = 'http://' + url;
    }
    Linking.openURL(finalUrl).catch(() => Alert.alert('Error', 'Could not open URL'));
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { alignItems: 'center', paddingHorizontal: 16 },

    // Enhanced Profile Picture with ring
    profileImageContainer: {
      position: 'relative',
      padding: 4,
      borderRadius: 56,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.45 : 0.16,
      shadowRadius: 14,
      elevation: 8,
    },
    profileImageRing: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 56,
      borderWidth: 3,
      borderColor: luxuryPalette.gold,
    },
    profileImagePulseRing: {
      position: 'absolute',
      top: -3,
      left: -3,
      right: -3,
      bottom: -3,
      borderRadius: 58,
      borderWidth: 2,
      borderColor: luxuryPalette.gold,
    },
    profileImage: {
      width: 102,
      height: 102,
      borderRadius: 51,
      borderWidth: 4,
      borderColor: colors.card,
      backgroundColor: colors.backgroundSecondary,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.success,
      borderWidth: 3,
      borderColor: colors.card,
    },

    heroCard: {
      marginHorizontal: 16,
      marginTop: -22,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 14,
      elevation: 4,
    },
    identityColumn: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    nameText: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
      fontFamily: Fonts.serif,
    },
    verifiedBadge: {
      marginLeft: 6,
    },
    pronounBadge: {
      backgroundColor: `${colors.tint}15`,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginLeft: 8,
    },
    pronounText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.tint,
    },
    username: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 10,
      letterSpacing: 0.4,
    },
    profileTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },

    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: luxuryPalette.deep,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    quickActionsColumn: {
      gap: 8,
    },
    quickActionButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: luxuryPalette.deep,
      justifyContent: 'center',
      alignItems: 'center',
    },

    statsGrid: {
      marginTop: 12,
      marginHorizontal: 16,
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 8,
    },
    statTile: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 10,
      backgroundColor: colors.card,
    },
    statValue: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.4,
      color: colors.text,
    },
    statLabel: {
      marginTop: 2,
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },

    aboutCard: {
      marginTop: 12,
      marginHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    emptyAboutText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    metadataRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 12,
    },
    metadataItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: luxuryPalette.deep,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metadataText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },

    buttonContainer: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: 12,
      marginBottom: 10,
      gap: 10,
    },
    button: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundSecondary,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    primaryButton: {
      backgroundColor: colors.tint,
      borderColor: colors.tint,
    },
    buttonText: {
      fontWeight: '600',
      fontSize: 14,
      color: colors.text,
    },
    primaryButtonText: {
      color: colors.background,
    },

    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 2,
      marginBottom: 8,
      backgroundColor: luxuryPalette.deep,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    activeTab: {
      backgroundColor: colors.card,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textTertiary,
    },
    activeTabText: {
      color: colors.text,
      fontWeight: '700',
    },

    // Grid
    grid: { flex: 1 },
    gridItem: {
      width: GRID_ITEM_SIZE,
      height: GRID_ITEM_SIZE,
      margin: 1,
      borderRadius: 8,
      overflow: 'hidden',
    },
    gridImage: {
      width: '100%',
      height: '100%',
    },
    gridItemOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0)',
    },
    mediaIndicator: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 12,
      padding: 4,
    },

    // Empty State
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      paddingHorizontal: 40,
    },
    emptyIconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    headerContentWrapper: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      marginTop: -18,
      paddingTop: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 170,
      backgroundColor: luxuryPalette.heroBase,
    },
    heroGlowPrimary: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      top: -96,
      right: -42,
      backgroundColor: luxuryPalette.heroGlowPrimary,
    },
    heroGlowSecondary: {
      position: 'absolute',
      width: 170,
      height: 170,
      borderRadius: 85,
      top: -60,
      left: -48,
      backgroundColor: luxuryPalette.heroGlowSecondary,
    },
    brandTopRow: {
      paddingHorizontal: 20,
      paddingTop: 8,
      alignItems: 'flex-end',
      marginBottom: 8,
    },
    signaturePill: {
      borderWidth: 1,
      borderColor: luxuryPalette.gold,
      backgroundColor: isDark ? 'rgba(12, 17, 24, 0.82)' : 'rgba(255,255,255,0.85)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    signatureText: {
      fontSize: 10,
      letterSpacing: 1.3,
      color: luxuryPalette.gold,
      fontWeight: '700',
    },
  }), [colorScheme, colors, isDark, luxuryPalette]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!user) {
    return <ThemedView style={styles.loadingContainer}><ThemedText>Could not load profile.</ThemedText></ThemedView>;
  }

  const renderHeader = () => (
    <View style={styles.headerContentWrapper}>
      <Animated.View pointerEvents="none" style={[styles.heroBackdrop, { transform: [{ translateY: heroBackdropShift }] }]}>
        <Animated.View style={[styles.heroGlowPrimary, { transform: [{ translateY: floatingGlowY }, { translateX: floatingGlowX }] }]} />
        <Animated.View style={[styles.heroGlowSecondary, { transform: [{ translateY: Animated.multiply(floatingGlowY, -0.7) }] }]} />
      </Animated.View>
      <View style={styles.brandTopRow}>
        <View style={styles.signaturePill}>
          <ThemedText style={styles.signatureText}>ASTRA PREMIERE</ThemedText>
        </View>
      </View>

      <Animated.View
        style={[
          styles.heroCard,
          {
            opacity: heroReveal,
            transform: [
              {
                translateY: heroReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [26, 0],
                }),
              },
              { translateY: heroCardTranslateY },
              { scale: heroCardScale },
            ],
          },
        ]}
      >
        <TouchableOpacity activeOpacity={0.9} onPress={() => setProfileModalVisible(true)}>
          <View style={styles.profileImageContainer}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.profileImagePulseRing,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.profileImageRing} />
            {!user.profilePicture || user.profilePicture.includes('anonymous-avatar-icon') || user.profilePicture.includes('pravatar.cc') ? (
              <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={54} color={colors.iconSecondary} />
              </View>
            ) : (
              <Image source={{ uri: user.profilePicture }} style={styles.profileImage} />
            )}
            <View style={styles.onlineIndicator} />
          </View>
        </TouchableOpacity>

        <View style={styles.identityColumn}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.nameText}>{user.name || user.username}</ThemedText>
            <Ionicons name="checkmark-circle" size={20} color={luxuryPalette.gold} style={styles.verifiedBadge} />
          </View>
          <ThemedText style={styles.username}>@{user.username}</ThemedText>

          <View style={styles.profileTagRow}>
            {user.pronouns ? (
              <View style={styles.pronounBadge}>
                <ThemedText style={styles.pronounText}>{user.pronouns}</ThemedText>
              </View>
            ) : null}
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <ThemedText style={styles.statusText}>Active</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.quickActionsColumn}>
          <PressScaleCard
            style={styles.quickActionButton}
            onPress={() => router.push('/profile/edit' as any)}
          >
            <Ionicons name="pencil" size={16} color={colors.text} />
          </PressScaleCard>
          <PressScaleCard
            style={styles.quickActionButton}
            onPress={handleShareProfile}
          >
            <Ionicons name="share-social-outline" size={16} color={colors.text} />
          </PressScaleCard>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.statsGrid,
          {
            opacity: statsReveal,
            transform: [
              {
                translateY: statsReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <PressScaleCard style={styles.statTile} activeOpacity={0.95}>
          <ThemedText style={styles.statValue}>{formatNumber(user.stats.posts)}</ThemedText>
          <ThemedText style={styles.statLabel}>Posts</ThemedText>
        </PressScaleCard>
        <PressScaleCard
          style={styles.statTile}
          onPress={() => router.push({
            pathname: '/followers-list' as any,
            params: { userId: user._id, username: user.username, type: 'followers' }
          })}
        >
          <ThemedText style={styles.statValue}>{formatNumber(user.stats.followers)}</ThemedText>
          <ThemedText style={styles.statLabel}>Followers</ThemedText>
        </PressScaleCard>
        <PressScaleCard
          style={styles.statTile}
          onPress={() => router.push({
            pathname: '/followers-list' as any,
            params: { userId: user._id, username: user.username, type: 'following' }
          })}
        >
          <ThemedText style={styles.statValue}>{formatNumber(user.stats.following)}</ThemedText>
          <ThemedText style={styles.statLabel}>Following</ThemedText>
        </PressScaleCard>
        <PressScaleCard style={styles.statTile} activeOpacity={0.95}>
          <ThemedText style={styles.statValue}>{formatNumber(user.stats.likes)}</ThemedText>
          <ThemedText style={styles.statLabel}>Likes</ThemedText>
        </PressScaleCard>
      </Animated.View>

      <Animated.View
        style={[
          styles.aboutCard,
          {
            opacity: aboutReveal,
            transform: [
              {
                translateY: aboutReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ThemedText style={styles.sectionTitle}>About</ThemedText>
        {user.bio ? <ExpandableBio text={user.bio} maxLines={3} /> : <ThemedText style={styles.emptyAboutText}>Add a short bio to make your profile stand out.</ThemedText>}

        <View style={styles.metadataRow}>
          {user.location ? (
            <View style={styles.metadataItem}>
              <Ionicons name="location" size={14} color={colors.tint} />
              <ThemedText style={styles.metadataText}>{user.location}</ThemedText>
            </View>
          ) : null}

          {user.website ? (
            <TouchableOpacity style={styles.metadataItem} onPress={() => openWebsite(user.website!)}>
              <Ionicons name="link" size={14} color={colors.accent} />
              <ThemedText style={[styles.metadataText, { color: colors.accent }]}>
                {user.website.replace(/^https?:\/\//, '')}
              </ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.buttonContainer,
          {
            opacity: actionReveal,
            transform: [
              {
                translateY: actionReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <PressScaleCard
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/profile/edit' as any)}
        >
          <Ionicons name="pencil" size={16} color={colors.background} />
          <ThemedText style={[styles.buttonText, styles.primaryButtonText]}>Edit Profile</ThemedText>
        </PressScaleCard>
        <PressScaleCard
          style={styles.button}
          onPress={handleShareProfile}
        >
          <Ionicons name="share-outline" size={16} color={colors.icon} />
          <ThemedText style={styles.buttonText}>Share</ThemedText>
        </PressScaleCard>
      </Animated.View>

      <Animated.View
        style={[
          styles.tabContainer,
          {
            opacity: actionReveal,
            transform: [
              {
                translateY: actionReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
          onPress={() => setActiveTab('posts')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'posts' ? 'grid' : 'grid-outline'}
            size={18}
            color={activeTab === 'posts' ? colors.text : colors.textTertiary}
          />
          <ThemedText style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
          onPress={() => setActiveTab('videos')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'videos' ? 'videocam' : 'videocam-outline'}
            size={18}
            color={activeTab === 'videos' ? colors.text : colors.textTertiary}
          />
          <ThemedText style={[styles.tabText, activeTab === 'videos' && styles.activeTabText]}>Videos</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reels' && styles.activeTab]}
          onPress={() => setActiveTab('reels')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'reels' ? 'film' : 'film-outline'}
            size={18}
            color={activeTab === 'reels' ? colors.text : colors.textTertiary}
          />
          <ThemedText style={[styles.tabText, activeTab === 'reels' && styles.activeTabText]}>Reels</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Top Header with username switcher and menu */}
      <TopHeaderComponent
        showMenuIcon={true}
        onMenuPress={() => setMenuVisible(true)}
      />
      
      <Animated.FlatList
        data={getFilteredPosts()}
        renderItem={renderPostItem}
        keyExtractor={(item: UserPost) => item._id}
        numColumns={3}
        style={styles.grid}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      />

      <ProfilePictureModal
        visible={isProfileModalVisible}
        uri={user.profilePicture}
        isEditable={true}
        onClose={() => setProfileModalVisible(false)}
        onUpdate={(newUri) => setUser(prev => prev ? { ...prev, profilePicture: newUri } : null)}
      />

      <ProfileMenu
        visible={isMenuVisible}
        onClose={() => setMenuVisible(false)}
      />
    </ThemedView>
  );
}

