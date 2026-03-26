import TopHeaderComponent from '@/components/TopHeaderComponent';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Share, StyleSheet, TouchableOpacity, View, useColorScheme, Animated, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProfilePictureModal from '@/components/ProfilePictureModal';
import ExpandableBio from '@/components/ExpandableBio';
import { useSocket } from '@/contexts/SocketContext';
import ProfileMenu from '@/components/ProfileMenu';

interface UserProfile {
  _id: string;
  username: string;
  name?: string;
  profilePicture: string;
  coverPhoto?: string;
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

// Animated Stat Card Component
const StatCard = ({
  value,
  label,
  icon,
  onPress,
  colorScheme,
  delay = 0
}: {
  value: number;
  label: string;
  icon: string;
  onPress?: () => void;
  colorScheme: string | null | undefined;
  delay?: number;
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const cardStyle = {
    backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
    borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  };

  const iconBgStyle = {
    backgroundColor: colorScheme === 'dark' ? 'rgba(74,221,174,0.15)' : 'rgba(74,221,174,0.1)',
  };

  return (
    <Animated.View style={{
      transform: [{ scale: scaleAnim }],
      opacity: opacityAnim,
      flex: 1,
      marginHorizontal: 4,
    }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        style={[{
          alignItems: 'center',
          paddingVertical: 16,
          paddingHorizontal: 8,
          borderRadius: 20,
          borderWidth: 1,
        }, cardStyle]}
      >
        <View style={[{
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 8,
        }, iconBgStyle]}>
          <Ionicons name={icon as any} size={18} color="#4ADDAE" />
        </View>
        <ThemedText style={{
          fontSize: 22,
          fontWeight: '800',
          letterSpacing: -0.5,
          color: colorScheme === 'dark' ? '#fff' : '#000',
        }}>
          {formatNumber(value)}
        </ThemedText>
        <ThemedText style={{
          fontSize: 11,
          fontWeight: '600',
          color: colorScheme === 'dark' ? '#888' : '#666',
          marginTop: 2,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          {label}
        </ThemedText>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { socket } = useSocket();


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
          console.error('Profile fetch error:', error);
          Alert.alert('Error', error.response?.data?.message || 'Failed to fetch profile data.');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [])
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

  const handleShareProfile = async () => {
    if (!user) return;

    const profileUrl = `https://astra.app/profile/${user.username}`;
    const shareMessage = user.name
      ? `Check out ${user.name} (@${user.username}) on Astra!\n\n${user.bio ? `"${user.bio.substring(0, 100)}${user.bio.length > 100 ? '...' : ''}"\n\n` : ''}${profileUrl}`
      : `Check out @${user.username} on Astra!\n\n${user.bio ? `"${user.bio.substring(0, 100)}${user.bio.length > 100 ? '...' : ''}"\n\n` : ''}${profileUrl}`;

    try {
      const result = await Share.share(
        {
          message: shareMessage,
          url: profileUrl,
          title: `${user.name || user.username}'s Profile`,
        },
        {
          dialogTitle: 'Share Profile',
          subject: `Check out ${user.name || user.username} on Astra!`,
        }
      );

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log('Shared with activity type:', result.activityType);
        }
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to share profile. Please try again.');
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
          <Ionicons name="play-circle" size={24} color="#fff" />
        </View>
      )}
      {item.mediaType === 'reel' && (
        <View style={styles.mediaIndicator}>
          <Ionicons name="film" size={20} color="#fff" />
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
          color={colorScheme === 'dark' ? '#444' : '#ccc'}
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
  const HEADER_MIN_HEIGHT = 100;

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT],
    outputRange: [0, -HEADER_MAX_HEIGHT + HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-180, 0, HEADER_MAX_HEIGHT],
    outputRange: [1.5, 1, 1],
    extrapolate: 'clamp',
  });

  const openWebsite = (url: string) => {
    let finalUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      finalUrl = 'http://' + url;
    }
    Linking.openURL(finalUrl).catch(() => Alert.alert('Error', 'Could not open URL'));
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { alignItems: 'center', paddingHorizontal: 16, marginTop: -55 },

    // Enhanced Profile Picture with ring
    profileImageContainer: {
      position: 'relative',
      padding: 4,
      borderRadius: 60,
      backgroundColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
    },
    profileImageRing: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 60,
      borderWidth: 3,
      borderColor: '#4ADDAE',
    },
    profileImage: {
      width: 110,
      height: 110,
      borderRadius: 55,
      borderWidth: 4,
      borderColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
      backgroundColor: colorScheme === 'dark' ? '#333' : '#eee',
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#4ADDAE',
      borderWidth: 3,
      borderColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
    },

    // Stats Container - Updated
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginTop: 24,
      paddingHorizontal: 8,
    },

    // Bio Container
    bioContainer: {
      alignItems: 'center',
      paddingHorizontal: 24,
      marginTop: 24,
      marginBottom: 20,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    nameText: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    verifiedBadge: {
      marginLeft: 6,
    },
    pronounBadge: {
      backgroundColor: colorScheme === 'dark' ? 'rgba(74,221,174,0.15)' : 'rgba(74,221,174,0.1)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginLeft: 8,
    },
    pronounText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#4ADDAE',
    },
    username: {
      fontSize: 14,
      fontWeight: '500',
      color: colorScheme === 'dark' ? '#8e8e93' : '#8e8e93',
      marginBottom: 12,
    },

    // Metadata Row
    metadataRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 16,
      marginTop: 12,
    },
    metadataItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    metadataText: {
      fontSize: 12,
      fontWeight: '500',
      color: colorScheme === 'dark' ? '#aaa' : '#666',
    },

    // Enhanced Buttons
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginVertical: 16,
      gap: 12,
    },
    button: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#2c2c2e' : '#e5e5ea',
      gap: 6,
    },
    primaryButton: {
      backgroundColor: '#4ADDAE',
      borderColor: '#4ADDAE',
    },
    buttonText: {
      fontWeight: '600',
      fontSize: 14,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    primaryButtonText: {
      color: '#000',
    },

    // Enhanced Tab Container
    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 8,
      backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      borderRadius: 14,
      padding: 4,
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
      backgroundColor: colorScheme === 'dark' ? '#2c2c2e' : '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colorScheme === 'dark' ? '#666' : '#999',
    },
    activeTabText: {
      color: colorScheme === 'dark' ? '#fff' : '#000',
      fontWeight: '700',
    },

    // Grid
    grid: { flex: 1 },
    gridItem: {
      width: GRID_ITEM_SIZE,
      height: GRID_ITEM_SIZE,
      margin: 1,
      borderRadius: 4,
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
      backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 2,
      borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      borderStyle: 'dashed',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colorScheme === 'dark' ? '#fff' : '#000',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#666' : '#999',
      textAlign: 'center',
    },

    // Header Content Wrapper
    headerContentWrapper: {
      backgroundColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      marginTop: -28,
      paddingTop: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },

    // Cover Photo
    coverPhotoContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 180,
      zIndex: -1,
    },
    coverPhotoImage: {
      width: '100%',
      height: '100%',
    },
    coverPhotoPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#e8e8e8',
    },
    coverPhotoOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
  }), [colorScheme]);

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <View style={{ alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4ADDAE" />
          <ThemedText style={{ marginTop: 16, color: colorScheme === 'dark' ? '#888' : '#666', fontSize: 14 }}>
            Loading profile...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!user) {
    return <ThemedView style={styles.loadingContainer}><ThemedText>Could not load profile.</ThemedText></ThemedView>;
  }

  const renderHeader = () => (
    <View style={styles.headerContentWrapper}>
      <View style={styles.header}>
        {/* Enhanced Profile Picture with Ring */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => setProfileModalVisible(true)}>
          <View style={styles.profileImageContainer}>
            <View style={styles.profileImageRing} />
            {!user.profilePicture || user.profilePicture.includes('anonymous-avatar-icon') || user.profilePicture.includes('pravatar.cc') ? (
              <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={60} color={colorScheme === 'dark' ? '#aaa' : '#888'} />
              </View>
            ) : (
              <Image source={{ uri: user.profilePicture }} style={styles.profileImage} />
            )}
            <View style={styles.onlineIndicator} />
          </View>
        </TouchableOpacity>

        {/* Enhanced Stats with Cards */}
        <View style={styles.statsContainer}>
          <StatCard
            value={user.stats.posts}
            label="Posts"
            icon="grid-outline"
            colorScheme={colorScheme}
            delay={0}
          />
          <StatCard
            value={user.stats.followers}
            label="Followers"
            icon="people-outline"
            colorScheme={colorScheme}
            delay={100}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: user._id, username: user.username, type: 'followers' }
            })}
          />
          <StatCard
            value={user.stats.following}
            label="Following"
            icon="person-add-outline"
            colorScheme={colorScheme}
            delay={200}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: user._id, username: user.username, type: 'following' }
            })}
          />
        </View>
      </View>

      {/* Bio Section */}
      <View style={styles.bioContainer}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.nameText}>{user.name || user.username}</ThemedText>
          <Ionicons name="checkmark-circle" size={20} color="#4ADDAE" style={styles.verifiedBadge} />
          {user.pronouns ? (
            <View style={styles.pronounBadge}>
              <ThemedText style={styles.pronounText}>{user.pronouns}</ThemedText>
            </View>
          ) : null}
        </View>

        {user.name ? <ThemedText style={styles.username}>@{user.username}</ThemedText> : null}

        {user.bio ? <ExpandableBio text={user.bio} maxLines={3} /> : null}

        {/* Enhanced Metadata */}
        <View style={styles.metadataRow}>
          {user.location ? (
            <View style={styles.metadataItem}>
              <Ionicons name="location" size={14} color="#4ADDAE" />
              <ThemedText style={styles.metadataText}>{user.location}</ThemedText>
            </View>
          ) : null}

          {user.website ? (
            <TouchableOpacity style={styles.metadataItem} onPress={() => openWebsite(user.website!)}>
              <Ionicons name="link" size={14} color="#007AFF" />
              <ThemedText style={[styles.metadataText, { color: '#007AFF' }]}>
                {user.website.replace(/^https?:\/\//, '')}
              </ThemedText>
            </TouchableOpacity>
          ) : null}

          {user.stats.likes > 0 && (
            <View style={styles.metadataItem}>
              <Ionicons name="heart" size={14} color="#ff3b30" />
              <ThemedText style={styles.metadataText}>{formatNumber(user.stats.likes)} likes</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Enhanced Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/profile/edit' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="pencil" size={16} color="#000" />
          <ThemedText style={[styles.buttonText, styles.primaryButtonText]}>Edit Profile</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={handleShareProfile}
          activeOpacity={0.8}
        >
          <Ionicons name="share-outline" size={16} color={colorScheme === 'dark' ? '#fff' : '#000'} />
          <ThemedText style={styles.buttonText}>Share</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Enhanced Tabs with Icons */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
          onPress={() => setActiveTab('posts')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'posts' ? 'grid' : 'grid-outline'}
            size={18}
            color={activeTab === 'posts' ? (colorScheme === 'dark' ? '#fff' : '#000') : (colorScheme === 'dark' ? '#666' : '#999')}
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
            color={activeTab === 'videos' ? (colorScheme === 'dark' ? '#fff' : '#000') : (colorScheme === 'dark' ? '#666' : '#999')}
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
            color={activeTab === 'reels' ? (colorScheme === 'dark' ? '#fff' : '#000') : (colorScheme === 'dark' ? '#666' : '#999')}
          />
          <ThemedText style={[styles.tabText, activeTab === 'reels' && styles.activeTabText]}>Reels</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Top Header with username switcher and menu */}
      <TopHeaderComponent
        showMenuIcon={true}
        onMenuPress={() => setMenuVisible(true)}
      />
      
      <Animated.View style={[styles.coverPhotoContainer, { transform: [{ translateY: headerTranslateY }] }]}>
        {user.coverPhoto ? (
          <Animated.Image source={{ uri: user.coverPhoto }} style={[styles.coverPhotoImage, { transform: [{ scale: imageScale }] }]} />
        ) : (
          <Animated.View style={[styles.coverPhotoPlaceholder, { transform: [{ scale: imageScale }] }]} />
        )}
        <View style={styles.coverPhotoOverlay} />
      </Animated.View>

      <Animated.FlatList
        data={getFilteredPosts()}
        renderItem={renderPostItem}
        keyExtractor={(item: UserPost) => item._id}
        numColumns={3}
        style={styles.grid}
        contentContainerStyle={{ paddingTop: HEADER_MAX_HEIGHT + 60, paddingBottom: 20 }}
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

