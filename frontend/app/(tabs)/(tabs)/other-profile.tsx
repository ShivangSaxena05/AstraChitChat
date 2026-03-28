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

interface UserProfile {
  _id: string;
  username: string;
  name?: string;
  isOnline?: boolean;
  lastSeen?: string;
  profilePicture: string;
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
          setLoading(true);
          console.log('Fetching other user profile:', `/profile/${userId}`);
          const userData = await get(`/profile/${userId}`);
          console.log('User data received:', userData);
          console.log('User stats:', userData.stats);
          console.log('Followers count:', userData.stats?.followers);
          console.log('Following count:', userData.stats?.following);
          setUser(userData);
          setIsBlocked(userData.isBlocked || false);
          setIsMuted(userData.isMuted || false);
          // Fetch follow status separately
          const followStatus = await get(`/follow/${userId}/check`);
          setIsFollowing(followStatus.isFollowing);
          setIsRequested(followStatus.isRequested);
          // For now, skip posts to avoid additional API calls
          setPosts([]);
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

      // Refetch user data to get accurate follower counts
      const updatedUserData = await get(`/users/${userId}`);
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
      
      // Refetch user data to get updated follower count
      const updatedUserData = await get(`/users/${userId}`);
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
    try {
      await post('/report/user', { reportedUserId: userId, reason: 'other' });
      Alert.alert('Success', 'User reported successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to report user');
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
      backgroundColor: colorScheme === 'dark' ? '#000' : '#f5f5f5',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colorScheme === 'dark' ? '#000' : '#f5f5f5',
    },

    // Cover Section
    coverSection: {
      position: 'relative',
      height: 140,
      backgroundColor: colorScheme === 'dark' ? '#222' : '#e8e8e8',
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
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
      marginHorizontal: 12,
      marginTop: -50,
      marginBottom: 12,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      shadowColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.5)' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colorScheme === 'dark' ? 0.3 : 0.08,
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
      borderColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
      backgroundColor: colorScheme === 'dark' ? '#333' : '#e8e8e8',
    },
    statusDot: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 3,
      borderColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
    },
    onlineDot: {
      backgroundColor: '#4ADDAE',
    },
    offlineDot: {
      backgroundColor: '#bbb',
    },

    // User Info Section
    userInfoSection: {
      alignItems: 'center',
      marginBottom: 16,
    },
    username: {
      fontSize: 20,
      fontWeight: '700',
      color: colorScheme === 'dark' ? '#fff' : '#000',
      marginBottom: 4,
    },
    displayName: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#aaa' : '#666',
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
      color: colorScheme === 'dark' ? '#aaa' : '#888',
    },

    // Stats Section
    statsSection: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colorScheme === 'dark' ? '#333' : '#f0f0f0',
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statItemMiddle: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colorScheme === 'dark' ? '#333' : '#f0f0f0',
    },
    statNumber: {
      fontSize: 18,
      fontWeight: '700',
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    statLabel: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#aaa' : '#888',
      marginTop: 4,
    },

    // Action Buttons Section
    actionButtonsSection: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: '#007AFF',
      paddingVertical: 12,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    primaryButtonActive: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#f5f5f5',
      borderWidth: 1.5,
      borderColor: '#007AFF',
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    primaryButtonTextActive: {
      color: '#007AFF',
    },
    secondaryButton: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#333' : '#f5f5f5',
      paddingVertical: 12,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      borderWidth: 1,
      borderColor: '#007AFF',
    },
    secondaryButtonText: {
      color: '#007AFF',
      fontWeight: '600',
      fontSize: 14,
    },

    // Tab Container
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colorScheme === 'dark' ? '#000' : '#f5f5f5',
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f0f0f0',
    },
    activeTab: {
      backgroundColor: '#007AFF',
    },
    tabText: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#aaa' : '#666',
    },
    activeTabText: {
      color: '#fff',
      fontWeight: '600',
    },

    // Grid
    grid: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#000' : '#f5f5f5',
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
      backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
      borderRadius: 10,
      padding: 2,
    },
    videoIcon: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#000' : '#fff',
    },
    reelIndicator: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
      borderRadius: 10,
      padding: 2,
    },
    reelIcon: {
      fontSize: 12,
      color: colorScheme === 'dark' ? '#000' : '#fff',
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
      color: colorScheme === 'dark' ? '#ccc' : '#666',
      textAlign: 'center',
      marginBottom: 10,
    },
    emptySubtext: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#999' : '#999',
      textAlign: 'center',
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    actionSheet: {
      backgroundColor: colorScheme === 'dark' ? '#222' : '#fff',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 30,
    },
    actionItem: {
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#eee',
    },
    actionItemText: {
      fontSize: 16,
      textAlign: 'center',
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    actionItemTextDestructive: {
      fontSize: 16,
      color: '#ff4444',
      textAlign: 'center',
      fontWeight: 'bold',
    },
  }), [colorScheme]);

  if (loading) {
    return <ThemedView style={styles.loadingContainer}><ActivityIndicator size="large" /></ThemedView>;
  }

  if (!user) {
    return <ThemedView style={styles.loadingContainer}><ThemedText>Could not load profile.</ThemedText></ThemedView>;
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />

      {/* Cover Photo Section */}
      <View style={styles.coverSection}>
        <View style={styles.coverPhoto} />
        {/* Menu Button */}
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Profile Header Card - Modern Style */}
      <View style={styles.headerCard}>
        {/* Avatar */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={() => setProfileModalVisible(true)}
          style={styles.avatarSection}
        >
          <View style={styles.avatarContainer}>
            <Image source={{ uri: user.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
          </View>
        </TouchableOpacity>

        {/* User Info */}
        <View style={styles.userInfoSection}>
          <ThemedText style={styles.username}>{user.name}</ThemedText>
          <ThemedText style={styles.displayName}>@{user.username}</ThemedText>
          
          {/* Online Status */}
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusIndicator,
              { backgroundColor: user.isOnline ? '#4ADDAE' : '#bbb' }
            ]} />
            <ThemedText style={styles.statusText}>
              {user.isOnline ? 'Online now' : (user.lastSeen ? `Last seen ${new Date(user.lastSeen).toLocaleString()}` : 'Offline')}
            </ThemedText>
          </View>

          {user.bio && <ExpandableBio text={user.bio} maxLines={3} />}
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <TouchableOpacity style={styles.statItem} activeOpacity={0.7}>
            <ThemedText style={styles.statNumber}>{userStats.posts}</ThemedText>
            <ThemedText style={styles.statLabel}>Posts</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, styles.statItemMiddle]}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: userId, username: user?.username || '', type: 'followers' }
            })}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.statNumber}>{userStats.followers}</ThemedText>
            <ThemedText style={styles.statLabel}>Followers</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, styles.statItemMiddle]}
            onPress={() => router.push({
              pathname: '/followers-list' as any,
              params: { userId: userId, username: user?.username || '', type: 'following' }
            })}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.statNumber}>{userStats.following}</ThemedText>
            <ThemedText style={styles.statLabel}>Following</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsSection}>
          {isFollowing ? (
            <>
              <TouchableOpacity 
                disabled={isActionLoading} 
                style={[styles.primaryButton, { opacity: isActionLoading ? 0.6 : 1 }]} 
                onPress={handleMessage}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                <ThemedText style={styles.primaryButtonText}>Message</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                disabled={isActionLoading} 
                style={[styles.secondaryButton, { opacity: isActionLoading ? 0.6 : 1 }]} 
                onPress={handleUnfollow}
              >
                <ThemedText style={styles.secondaryButtonText}>Unfollow</ThemedText>
              </TouchableOpacity>
            </>
          ) : isRequested ? (
            <TouchableOpacity 
              disabled={isActionLoading} 
              style={[styles.secondaryButton, { opacity: isActionLoading ? 0.6 : 1 }]} 
              onPress={handleUnfollow}
            >
              <ThemedText style={styles.secondaryButtonText}>Requested</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              disabled={isActionLoading} 
              style={[styles.primaryButton, { opacity: isActionLoading ? 0.6 : 1 }]} 
              onPress={handleFollow}
            >
              <ThemedText style={styles.primaryButtonText}>Follow</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Container */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'posts' && styles.activeTab]}
          onPress={() => setActiveTab('posts')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>📷 Posts</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
          onPress={() => setActiveTab('videos')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'videos' && styles.activeTabText]}>🎥 Videos</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reels' && styles.activeTab]}
          onPress={() => setActiveTab('reels')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'reels' && styles.activeTabText]}>🎬 Reels</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Post Grid */}
      <FlatList
        data={getFilteredPosts()}
        renderItem={renderPostItem}
        keyExtractor={(item) => item._id}
        numColumns={3}
        style={styles.grid}
        ListEmptyComponent={renderEmptyState}
      />

      <ProfilePictureModal 
        visible={isProfileModalVisible}
        uri={user.profilePicture || 'https://i.pravatar.cc/150'}
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
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionItem} onPress={() => { setMenuVisible(false); handleBlock(); }}>
              <ThemedText style={isBlocked ? styles.actionItemTextDestructive : styles.actionItemText}>
                {isBlocked ? 'Unblock User' : 'Block User'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => { setMenuVisible(false); handleMute(); }}>
              <ThemedText style={isMuted ? styles.actionItemTextDestructive : styles.actionItemText}>
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
