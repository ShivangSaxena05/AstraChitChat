import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { del, get, post } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, StyleSheet, TouchableOpacity, View, useColorScheme, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import ProfilePictureModal from '@/components/ProfilePictureModal';
import ExpandableBio from '@/components/ExpandableBio';
import { useSocket } from '@/contexts/SocketContext';
import { useTheme } from '@/hooks/use-theme-color';

interface UserProfile {
  _id: string;
  username: string;
  name?: string;
  isOnline?: boolean;
  lastSeen?: string;
  profilePicture: string;
  coverPhoto?: string; // Add coverPhoto property for Bug 4 fix
  bio: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
    likes: number;
  };
  isFollowing?: boolean;
  isBlocked?: boolean;
  isMuted?: boolean;
  isPrivate?: boolean;
}

interface UserPost {
  _id: string;
  mediaUrl: string;
  mediaType: string;
}

type TabType = 'posts' | 'videos' | 'reels';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 4) / 3; // Subtracting margins

interface OtherProfileScreenProps {
  userId: string;
  onMessage?: (chatId: string, otherUserId: string, otherUsername: string) => void;
}

export default function OtherProfileScreen({ userId, onMessage }: OtherProfileScreenProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequested, setIsRequested] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = useTheme();
  const { socket } = useSocket();

  // Ensure stats are always available (with defaults if needed)
  const userStats = user?.stats || {
    posts: 0,
    followers: 0,
    following: 0,
    likes: 0,
  };

  // useFocusEffect will refetch data every time the screen comes into view
  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
        try {
          if (!userId) {
            Alert.alert('Error', 'User ID is missing.');
            setLoading(false);
            return;
          }

          setLoading(true);
          console.log('Fetching other user profile:', `/profile/${userId}`);
          
          // 🐛 Bug 2 Fix: Fetch in parallel instead of sequentially
          const [userData, followStatus, postsData] = await Promise.all([
            get(`/profile/${userId}`),
            get(`/follow/${userId}/check`),
            get(`/posts/user/${userId}`) // 🐛 Bug 3 Fix: Actually fetch posts instead of hardcoding empty array
          ]);

          console.log('User data received:', userData);
          console.log('User stats:', userData.stats);
          console.log('Followers count:', userData.stats?.followers);
          console.log('Following count:', userData.stats?.following);
          
          setUser(userData);
          setIsBlocked(userData.isBlocked || false);
          setIsMuted(userData.isMuted || false);
          setIsFollowing(followStatus.isFollowing);
          setIsRequested(followStatus.isRequested);
          setPosts(postsData.posts || []); // 🐛 Bug 3 Fix: Use actual posts data
        } catch (error: any) {
          console.error('Profile fetch error:', error);
          console.error('Error response:', error.response);
          Alert.alert('Error', error.response?.data?.message || 'Failed to fetch profile data.');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [userId])
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

    const handlePresenceUpdate = (data: any) => {
      if (data.userId === user._id) {
        setUser(prev => prev ? { ...prev, isOnline: data.isOnline, lastSeen: data.lastSeen || prev.lastSeen } : prev);
      }
    };

    socket.on('profileStatsUpdated', handleStatsUpdate);
    socket.on('user online', handlePresenceUpdate);
    return () => {
      socket.off('profileStatsUpdated', handleStatsUpdate);
      socket.off('user online', handlePresenceUpdate);
    };
  }, [socket, user?._id]);

  const handleFollow = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);

    // Optimistic Update
    const wasFollowing = isFollowing;
    const wasRequested = isRequested;

    if (user?.isPrivate) {
      setIsRequested(true);
    } else {
      setIsFollowing(true);
    }

    try {
      const response = await post(`/follow/${userId}`, {});
      
      // Update UI matching strict backend verdict
      setIsFollowing(!!response.isFollowing);
      setIsRequested(!!response.isRequested);

      // 🐛 Bug 1 Fix: Use /profile/:userId instead of /users/:userId
      const updatedUserData = await get(`/profile/${userId}`);
      setUser(updatedUserData);
    } catch (error: any) {
      // Rollback on failure
      setIsFollowing(wasFollowing);
      setIsRequested(wasRequested);
      console.error('Follow error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to follow user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);

    // Optimistic Update
    const wasFollowing = isFollowing;
    const wasRequested = isRequested;

    setIsFollowing(false);
    setIsRequested(false);

    try {
      await del(`/follow/${userId}`);
      
      // 🐛 Bug 1 Fix: Use /profile/:userId instead of /users/:userId
      const updatedUserData = await get(`/profile/${userId}`);
      setUser(updatedUserData);
    } catch (error: any) {
      // Rollback on failure
      setIsFollowing(wasFollowing);
      setIsRequested(wasRequested);
      console.error('Unfollow error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to unfollow user');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMessage = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);

    try {
      if (!userId) {
        Alert.alert('Error', 'User ID is missing. Cannot start chat.');
        setIsActionLoading(false);
        return;
      }

      let chatId = null;
      let chatData;

      try {
        // Try to find an existing chat
        const existingChat = await get(`/chats/find/${userId}`);
        chatId = existingChat.chat._id;
      } catch (findError) {
        // If not found, create a new one
        const currentUserId = await AsyncStorage.getItem('userId');
        if (!currentUserId) throw new Error('Current user not found');
        if (currentUserId === userId) {
          Alert.alert('Error', 'You cannot start a chat with yourself.');
          return;
        }
        const data = await post('/chats/create', { participants: [currentUserId, userId] });
        chatId = data._id;
        chatData = data;
      }

      const data = chatData || { _id: chatId };
      if (onMessage) {
        onMessage(data._id, userId, user?.username || '');
      } else {
        router.push({
          pathname: '/chat/detail',
          params: {
            chatId: data._id,
            otherUserId: userId,
            otherUsername: user?.username || ''
          }
        });
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleBlock = async () => {
    try {
      const response = await post(`/users/${userId}/block`, {});
      setIsBlocked(response.isBlocked);
      if (response.isBlocked) {
        setIsFollowing(false); // Optimistically unfollow
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to block/unblock user');
    }
  };

  const handleMute = async () => {
    try {
      const response = await post(`/users/${userId}/mute`, {});
      setIsMuted(response.isMuted);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to mute/unmute user');
    }
  };

  const handleReport = async () => {
    // ⚠️ Minor Issue Fix: Prompt user for reason instead of hardcoding 'other'
    Alert.alert(
      'Report User',
      'Why are you reporting this user?',
      [
        {
          text: 'Spam',
          onPress: async () => await submitReport('spam'),
        },
        {
          text: 'Harassment',
          onPress: async () => await submitReport('harassment'),
        },
        {
          text: 'Inappropriate Content',
          onPress: async () => await submitReport('inappropriate_content'),
        },
        {
          text: 'Other',
          onPress: async () => await submitReport('other'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );

    const submitReport = async (reason: string) => {
      try {
        await post('/report/user', { reportedUserId: userId, reason });
        Alert.alert('Success', 'User reported successfully.');
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.message || 'Failed to report user');
      }
    };
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

  const renderPostItem = ({ item }: { item: UserPost }) => (
    <TouchableOpacity style={styles.gridItem}>
      <Image source={{ uri: item.mediaUrl }} style={styles.gridImage} />
      {item.mediaType === 'video' && (
        <View style={styles.videoIndicator}>
          <ThemedText style={styles.videoIcon}>▶️</ThemedText>
        </View>
      )}
      {item.mediaType === 'reel' && (
        <View style={styles.reelIndicator}>
          <ThemedText style={styles.reelIcon}>🎥</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyText}>
        {activeTab === 'posts' && 'No posts yet'}
        {activeTab === 'videos' && 'No videos yet'}
        {activeTab === 'reels' && 'No reels yet'}
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        {activeTab === 'posts' && 'Share your first post to get started!'}
        {activeTab === 'videos' && 'Share your first video to get started!'}
        {activeTab === 'reels' && 'Share your first reel to get started!'}
      </ThemedText>
    </View>
  );

  const styles = useMemo(() => StyleSheet.create({
    // Container
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Cover Section
    coverSection: {
      position: 'relative',
      height: 140,
    },
    coverPhoto: {
      width: '100%',
      height: '100%',
    },
    menuButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: 20,
      padding: 8,
      zIndex: 10,
    },

    // Profile Header Card
    headerCard: {
      marginHorizontal: 12,
      marginTop: -50,
      marginBottom: 12,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 3,
    },

    // Avatar Section
    avatarSection: {
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarContainer: {
      position: 'relative',
      marginTop: -70,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 4,
    },
    statusDot: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 3,
    },
    onlineDot: {
      backgroundColor: colors.success,
    },
    offlineDot: {
      backgroundColor: colors.textSecondary,
    },

    // User Info Section
    userInfoSection: {
      alignItems: 'center',
      marginBottom: 16,
    },
    username: {
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },
    displayName: {
      fontSize: 14,
      marginTop: 2,
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    statusIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    statusText: {
      fontSize: 12,
    },

    // Stats Section
    statsSection: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statItemMiddle: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
    },
    statNumber: {
      fontSize: 18,
      fontWeight: '700',
    },
    statLabel: {
      fontSize: 12,
      marginTop: 4,
    },

    // Action Buttons Section
    actionButtonsSection: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    primaryButtonActive: {
      borderWidth: 1.5,
    },
    primaryButtonText: {
      color: colors.background,
      fontWeight: '600',
      fontSize: 14,
    },
    primaryButtonTextActive: {
      fontWeight: '600',
      fontSize: 14,
    },
    secondaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      borderWidth: 1,
    },
    secondaryButtonText: {
      fontWeight: '600',
      fontSize: 14,
    },

    // Tab Container
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    activeTab: {},
    tabText: {
      fontSize: 14,
    },
    activeTabText: {
      color: colors.background,
      fontWeight: '600',
    },

    // Grid
    grid: {
      flex: 1,
    },
    gridItem: {
      width: GRID_ITEM_SIZE,
      height: GRID_ITEM_SIZE,
      margin: 1,
    },
    gridImage: {
      width: '100%',
      height: '100%',
    },
    videoIndicator: {
      position: 'absolute',
      top: 5,
      right: 5,
      borderRadius: 10,
      padding: 2,
    },
    videoIcon: {
      fontSize: 12,
    },
    reelIndicator: {
      position: 'absolute',
      top: 5,
      right: 5,
      borderRadius: 10,
      padding: 2,
    },
    reelIcon: {
      fontSize: 12,
    },

    // Empty State
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    emptyText: {
      fontSize: 18,
      textAlign: 'center',
      marginBottom: 10,
    },
    emptySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    actionSheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 30,
    },
    actionItem: {
      paddingVertical: 18,
      borderBottomWidth: 1,
    },
    actionItemText: {
      fontSize: 16,
      textAlign: 'center',
    },
    actionItemTextDestructive: {
      fontSize: 16,
      color: colors.error,
      textAlign: 'center',
      fontWeight: 'bold',
    },
  }), [colorScheme, colors]);

  if (loading) {
    return <ThemedView style={[styles.loadingContainer, { backgroundColor: colors.background }]}><ActivityIndicator size="large" /></ThemedView>;
  }

  if (!user) {
    return <ThemedView style={[styles.loadingContainer, { backgroundColor: colors.background }]}><ThemedText>Could not load profile.</ThemedText></ThemedView>;
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />

      {/* Cover Photo Section */}
      <View style={[styles.coverSection, { backgroundColor: colors.backgroundTertiary }]}>
        {/* 🐛 Bug 4 Fix: Actually render the cover photo if it exists */}
        {user.coverPhoto ? (
          <Image source={{ uri: user.coverPhoto }} style={styles.coverPhoto} />
        ) : (
          <View style={[styles.coverPhoto, { backgroundColor: colors.backgroundTertiary }]} />
        )}
        {/* Menu Button */}
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Profile Header Card - Modern Style */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
        {/* Avatar */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => setProfileModalVisible(true)}
          style={styles.avatarSection}
        >
          <View style={styles.avatarContainer}>
            {user.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={[styles.avatar, { borderColor: colors.card, backgroundColor: colors.backgroundSecondary }]} />
            ) : (
              // 🐛 Bug 5 Fix: Use local fallback instead of third-party pravatar.cc
              <View style={[styles.avatar, { borderColor: colors.card, backgroundColor: colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={60} color={colors.textTertiary} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* User Info */}
        <View style={styles.userInfoSection}>
          <ThemedText style={[styles.username, { color: colors.text }]}>{user.name}</ThemedText>
          <ThemedText style={[styles.displayName, { color: colors.textSecondary }]}>@{user.username}</ThemedText>
          
          {/* Online Status */}
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusIndicator,
              { backgroundColor: user.isOnline ? colors.success : colors.textMuted }
            ]} />
            <ThemedText style={[styles.statusText, { color: colors.textSecondary }]}>
              {user.isOnline ? 'Online now' : (user.lastSeen ? `Last seen ${new Date(user.lastSeen).toLocaleString()}` : 'Offline')}
            </ThemedText>
          </View>

          {user.bio && <ExpandableBio text={user.bio} maxLines={3} />}
        </View>

        {/* Stats Section */}
        <View style={[styles.statsSection, { borderColor: colors.border }]}>
          <TouchableOpacity style={styles.statItem} activeOpacity={0.7}>
            <ThemedText style={[styles.statNumber, { color: colors.text }]}>{userStats.posts}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Posts</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, styles.statItemMiddle, { borderColor: colors.border }]}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: userId, username: user?.username || '', type: 'followers' }
            })}
            activeOpacity={0.7}
          >
            <ThemedText style={[styles.statNumber, { color: colors.text }]}>{userStats.followers}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Followers</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, styles.statItemMiddle, { borderColor: colors.border }]}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: userId, username: user?.username || '', type: 'following' }
            })}
            activeOpacity={0.7}
          >
            <ThemedText style={[styles.statNumber, { color: colors.text }]}>{userStats.following}</ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Following</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsSection}>
          {isFollowing ? (
            <>
              <TouchableOpacity 
                disabled={isActionLoading} 
                style={[styles.primaryButton, { backgroundColor: colors.tint, opacity: isActionLoading ? 0.6 : 1 }]} 
                onPress={handleMessage}
              >
                <Ionicons name="chatbubble-outline" size={16} color={colors.background} />
                <ThemedText style={styles.primaryButtonText}>Message</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                disabled={isActionLoading} 
                style={[styles.secondaryButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.tint, opacity: isActionLoading ? 0.6 : 1 }]} 
                onPress={handleUnfollow}
              >
                <ThemedText style={styles.secondaryButtonText}>Unfollow</ThemedText>
              </TouchableOpacity>
            </>
          ) : isRequested ? (
            <TouchableOpacity 
              disabled={isActionLoading} 
              style={[styles.secondaryButton, { backgroundColor: colors.backgroundSecondary, opacity: isActionLoading ? 0.6 : 1 }]} 
              onPress={handleUnfollow}
            >
              <ThemedText style={styles.secondaryButtonText}>Requested</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              disabled={isActionLoading} 
              style={[styles.primaryButton, { backgroundColor: colors.tint, opacity: isActionLoading ? 0.6 : 1 }]} 
              onPress={handleFollow}
            >
              <ThemedText style={styles.primaryButtonText}>Follow</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Container */}
      <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.backgroundSecondary }, activeTab === 'posts' && { backgroundColor: colors.tint }]}
          onPress={() => setActiveTab('posts')}
        >
          <ThemedText style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'posts' && styles.activeTabText]}>📷 Posts</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.backgroundSecondary }, activeTab === 'videos' && { backgroundColor: colors.tint }]}
          onPress={() => setActiveTab('videos')}
        >
          <ThemedText style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'videos' && styles.activeTabText]}>🎥 Videos</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.backgroundSecondary }, activeTab === 'reels' && { backgroundColor: colors.tint }]}
          onPress={() => setActiveTab('reels')}
        >
          <ThemedText style={[styles.tabText, { color: colors.textSecondary }, activeTab === 'reels' && styles.activeTabText]}>🎬 Reels</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Post Grid */}
      <FlatList
        data={getFilteredPosts()}
        renderItem={renderPostItem}
        keyExtractor={(item) => item._id}
        numColumns={3}
        style={[styles.grid, { backgroundColor: colors.background }]}
        ListEmptyComponent={renderEmptyState}
      />

      <ProfilePictureModal 
        visible={isProfileModalVisible}
        uri={user.profilePicture || ''}
        isEditable={false}
        onClose={() => setProfileModalVisible(false)}
      />

      {/* Action Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={[styles.actionItem, { borderBottomColor: colors.border }]} onPress={() => { setMenuVisible(false); handleBlock(); }}>
              <ThemedText style={isBlocked ? styles.actionItemTextDestructive : [styles.actionItemText, { color: colors.text }]}>
                {isBlocked ? 'Unblock User' : 'Block User'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionItem, { borderBottomColor: colors.border }]} onPress={() => { setMenuVisible(false); handleMute(); }}>
              <ThemedText style={isMuted ? styles.actionItemTextDestructive : [styles.actionItemText, { color: colors.text }]}>
                {isMuted ? 'Unmute User' : 'Mute User'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionItem, { borderBottomWidth: 0 }]} onPress={() => { setMenuVisible(false); handleReport(); }}>
              <ThemedText style={styles.actionItemTextDestructive}>Report User</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ThemedView>
  );
}
