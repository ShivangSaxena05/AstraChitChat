import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Image, ActivityIndicator, TouchableOpacity, StyleSheet, Alert, Text, RefreshControl } from 'react-native';
import { LayoutAnimation, Platform } from 'react-native';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get, post, del } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import PostCard from '@/components/PostCard';
import ProfileMenu from '@/components/ProfileMenu';
import { useSocket } from '@/contexts/SocketContext';

interface UserProfile {
  _id: string;
  name: string;
  username: string;
  profilePicture: string;
  coverPhoto?: string;
  bio?: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
  };
  isPrivate?: boolean;
  isBlocked?: boolean;
  isFollowing?: boolean;
  isOnline: boolean;
  lastSeen?: string;
}

interface Post {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  likes: number;
  comments: number;
  createdAt: string;
}

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ userId: string }>();
  const userId = params?.userId as string;
  const router = useRouter();
  const { currentUserId, onlineUsers } = useSocket();

  useEffect(() => {
    console.log('Profile Screen - Received userId:', userId);
    console.log('Profile Screen - All params:', params);
  }, [userId, params]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSkeleton, setIsSkeleton] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const toggleMenu = () => setMenuVisible(!menuVisible);

  const fetchProfile = useCallback(async () => {
    setIsSkeleton(true);
    // Layout animation for smooth data update
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (!userId) {
      console.error('No userId provided');
      setLoading(false);
      setIsSkeleton(false);
      return;
    }

    try {
      setLoading(true);
      // Try multiple endpoints to fetch profile
      let data;
      try {
        data = await get(`/profile/${userId}`);
      } catch (error) {
        // Fallback to user endpoint
        data = await get(`/users/${userId}`);
      }

      if (!data) {
        throw new Error('Profile data not available');
      }

      setProfile(data);
      setIsFollowing(data.isFollowing || false);
      setOnlineStatus(data.isOnline || onlineUsers.has(userId));

      // Fetch user's posts
      try {
        const postsData = await get(`/posts/user/${userId}`);
        setPosts(postsData.posts || []);
      } catch (postError) {
        console.log('No posts available:', postError);
        setPosts([]);
      }
    } catch (error: any) {
      console.error('Fetch profile error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
      setIsSkeleton(false);
    }
  }, [userId, onlineUsers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfile().finally(() => setRefreshing(false));
  }, [fetchProfile]);

  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    if (!userId) return;
    
    // Store previous state for rollback
    const previousFollowState = isFollowing;
    
    try {
      setFollowLoading(true);
      
      // Optimistic UI update
      setIsFollowing(!isFollowing);
      
      if (previousFollowState) {
        // Unfollow
        await del(`/follow/${userId}`);
        Alert.alert('Unfollowed', `You unfollowed ${profile?.username}`);
      } else {
        // Follow
        await post(`/follow/${userId}`, {});
        Alert.alert('Following', `You are now following ${profile?.username}`);
      }
      
      // Refresh profile to update stats and verify follow status
      fetchProfile();
    } catch (error: any) {
      // Rollback on failure
      setIsFollowing(previousFollowState);
      console.error('Follow toggle error:', error);
      Alert.alert('Error', error.response?.data?.message || error.message || 'Failed to update follow status');
    } finally {
      setFollowLoading(false);
    }
  };

  // Listen for online status changes
  useEffect(() => {
    if (userId && onlineUsers.has(userId)) {
      setOnlineStatus(true);
    } else {
      setOnlineStatus(profile?.isOnline || false);
    }
  }, [onlineUsers, profile?.isOnline, userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleMessagePress = () => {
    if (!userId || !profile?.username) return;
    router.push({
      pathname: '/chat/detail',
      params: {
        chatId: '', // Empty to create new
        otherUserId: userId,
        otherUsername: profile.username
      }
    });
  };

  const renderPost = ({ item }: { item: Post }) => <PostCard post={item} />;

  if (isSkeleton) {
    return <ProfileSkeleton />;
  }

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="person" size={64} color="#666" />
        <ThemedText style={styles.errorTitle}>Profile Not Found</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  // Edge Cases
  if (profile?.isBlocked) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={64} color="#666" />
        <ThemedText style={styles.errorTitle}>Blocked User</ThemedText>
        <ThemedText style={styles.errorText}>You have blocked this user. Their profile is not visible.</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (profile?.isPrivate && !profile?.isFollowing) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={64} color="#007AFF" />
        <ThemedText style={styles.errorTitle}>Private Account</ThemedText>
        <ThemedText style={styles.errorText}>This account is private. Follow to see their posts.</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <ThemedText style={styles.retryText}>Request to Follow</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="person-outline" size={64} color="#666" />
        <ThemedText style={styles.errorTitle}>Profile Not Found</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Cover Photo Section */}
      <View style={styles.coverSection}>
        {profile?.coverPhoto && (
          <Image source={{ uri: profile.coverPhoto }} style={styles.coverPhoto} />
        )}
        {/* Menu Button */}
        <TouchableOpacity style={styles.menuButton} onPress={toggleMenu}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Profile Header - Modern Card Style */}
      <View style={styles.headerCard}>
        {/* Avatar with Status */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: profile?.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
            <View style={[
              styles.statusDot,
              onlineStatus ? styles.onlineDot : styles.offlineDot
            ]} />
          </View>
        </View>

        {/* User Info Section */}
        <View style={styles.userInfoSection}>
          <ThemedText style={styles.username}>{profile?.name}</ThemedText>
          <ThemedText style={styles.displayName}>@{profile?.username}</ThemedText>
          {profile?.bio && <ThemedText style={styles.bio}>{profile.bio}</ThemedText>}
        </View>

        {/* Stats Section - Three Column Layout */}
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <ThemedText style={styles.statNumber}>{profile?.stats.posts}</ThemedText>
            <ThemedText style={styles.statLabel}>Posts</ThemedText>
          </View>
          <View style={[styles.statItem, styles.statItemMiddle]}>
            <ThemedText style={styles.statNumber}>{profile?.stats.followers}</ThemedText>
            <ThemedText style={styles.statLabel}>Followers</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText style={styles.statNumber}>{profile?.stats.following}</ThemedText>
            <ThemedText style={styles.statLabel}>Following</ThemedText>
          </View>
        </View>

        {/* Action Buttons Section */}
        <View style={styles.actionButtonsSection}>
          {/* Message Button */}
          <TouchableOpacity style={styles.primaryButton} onPress={handleMessagePress}>
            <Ionicons name="chatbubble-outline" size={18} color="#fff" />
            <ThemedText style={styles.primaryButtonText}>Message</ThemedText>
          </TouchableOpacity>

          {/* Share Profile Button */}
          <TouchableOpacity style={styles.secondaryButton} onPress={handleMessagePress}>
            <Ionicons name="share-social" size={18} color="#007AFF" />
            <ThemedText style={styles.secondaryButtonText}>Share</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ProfileMenu visible={menuVisible} onClose={toggleMenu} />

      {/* Posts */}
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.postsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={48} color="#ccc" />
              <ThemedText style={styles.emptyText}>No posts yet</ThemedText>
            </View>
          }
        />
      </ThemedView>
    );
  }

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  
  // Cover Section
  coverSection: {
    position: 'relative',
    height: 140,
    backgroundColor: '#e8e8e8',
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
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: -50,
    marginBottom: 12,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
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
    borderColor: '#fff',
    backgroundColor: '#e8e8e8',
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#fff',
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
    color: '#000',
  },
  displayName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  bio: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    textAlign: 'center',
  },

  // Stats Section
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statItemMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#f0f0f0',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
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
    gap: 8,
  },
  primaryButtonActive: {
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#f5f5f5',
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

  // Posts List
  postsList: {
    padding: 12,
    paddingTop: 0,
    backgroundColor: '#f5f5f5',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#f5f5f5',
  },
  emptyText: {
    marginTop: 12,
    color: '#999',
    fontSize: 14,
  },

  // Error States
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 12,
    color: '#000',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

