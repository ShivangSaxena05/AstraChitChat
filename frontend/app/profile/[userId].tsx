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
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { currentUserId, onlineUsers } = useSocket();

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

    if (!userId) return;
    try {
      setLoading(true);
      const data = await get(`/profile/${userId}`);
      setProfile(data);
      setIsFollowing(data.isFollowing || false);
      setOnlineStatus(data.isOnline || onlineUsers.has(userId));

      // Fetch user's posts
      const postsData = await get(`/posts/user/${userId}`);
      setPosts(postsData.posts || []);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
      setIsSkeleton(false);
    }
  }, [userId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfile().finally(() => setRefreshing(false));
  }, [fetchProfile]);

  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    if (!userId) return;
    try {
      setFollowLoading(true);
      if (isFollowing) {
        // Unfollow
        await del(`/follow/${userId}`);
        setIsFollowing(false);
        Alert.alert('Unfollowed', `You unfollowed ${profile?.username}`);
      } else {
        // Follow
        await post(`/follow/${userId}`, {});
        setIsFollowing(true);
        Alert.alert('Following', `You are now following ${profile?.username}`);
      }
      // Refresh profile to update stats
      fetchProfile();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update follow status');
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
      {/* Cover Photo */}
      {profile?.coverPhoto && (
        <Image source={{ uri: profile.coverPhoto }} style={styles.coverPhoto} />
      )}

      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Image source={{ uri: profile?.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
          <View style={[
            styles.statusDot,
            onlineStatus ? styles.onlineDot : styles.offlineDot
          ]} />
        </View>
        <View style={styles.infoContainer}>
          <ThemedText type="title" style={styles.username}>@{profile?.username}</ThemedText>
          <ThemedText style={styles.name}>{profile?.name}</ThemedText>
          {profile?.bio && <ThemedText style={styles.bio}>{profile.bio}</ThemedText>}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile?.stats.posts}</ThemedText>
              <ThemedText>Posts</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile?.stats.followers}</ThemedText>
              <ThemedText>Followers</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile?.stats.following}</ThemedText>
              <ThemedText>Following</ThemedText>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {/* Follow/Unfollow Button */}
          <TouchableOpacity
            style={[
              styles.followButton,
              isFollowing && styles.followButtonActive
            ]}
            onPress={handleFollowToggle}
            disabled={followLoading}
          >
            {followLoading ? (
              <ActivityIndicator size="small" color={isFollowing ? "#007AFF" : "#fff"} />
            ) : (
              <>
                <Ionicons name={isFollowing ? "person-remove" : "person-add"} size={16} color={isFollowing ? "#007AFF" : "#fff"} />
                <ThemedText style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>

          {/* Message Button */}
          <TouchableOpacity style={styles.messageButton} onPress={handleMessagePress}>
            <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
            <ThemedText style={styles.messageButtonText}>Message</ThemedText>
          </TouchableOpacity>
        </View>
        
        {/* Top-right Menu Button */}
        <TouchableOpacity style={styles.menuButton} onPress={toggleMenu}>
          <Ionicons name="ellipsis-vertical" size={24} color="#666" />
        </TouchableOpacity>
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
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverPhoto: {
    width: '100%',
    height: 200,
  },
  header: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#fff',
    marginTop: -50,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#fff',
  },
  statusDot: {
    position: 'absolute',
    bottom: 8,
    right: 8,
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
    backgroundColor: '#ccc',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  username: {
    fontWeight: 'bold',
    fontSize: 20,
  },
  name: {
    fontSize: 16,
    marginVertical: 4,
  },
  bio: {
    fontSize: 14,
    color: '#666',
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'flex-end',
  },
  followButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
  },
  followButtonActive: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  followButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  followButtonTextActive: {
    color: '#007AFF',
  },
  messageButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
  },
  messageButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  postsList: {
    padding: 16,
    paddingTop: 8,
  },
  menuButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 8,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

