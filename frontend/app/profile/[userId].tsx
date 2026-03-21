import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Image, ActivityIndicator, TouchableOpacity, StyleSheet, Alert, Text, RefreshControl } from 'react-native';
import { LayoutAnimation, Platform } from 'react-native';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
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

  // Listen for online status changes (assumes SocketContext emits updates)
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

  // Edge Cases
  if (profile.isBlocked) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#666" />
        <ThemedText style={styles.errorTitle}>Blocked User</ThemedText>
        <ThemedText style={styles.errorText}>You have blocked this user. Their profile is not visible.</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (profile.isPrivate && !profile.isFollowing) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="lock-outline" size={64} color="#007AFF" />
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
      {profile.coverPhoto && (
        <Image source={{ uri: profile.coverPhoto }} style={styles.coverPhoto} />
      )}

      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Image source={{ uri: profile.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
          <View style={[
            styles.statusDot,
            onlineStatus ? styles.onlineDot : styles.offlineDot
          ]} />
        </View>
        <View style={styles.infoContainer}>
          <ThemedText type="title" style={styles.username}>@{profile.username}</ThemedText>
          <ThemedText style={styles.name}>{profile.name}</ThemedText>
          {profile.bio && <ThemedText style={styles.bio}>{profile.bio}</ThemedText>}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile.stats.posts}</ThemedText>
              <ThemedText>Posts</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile.stats.followers}</ThemedText>
              <ThemedText>Followers</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText type="subtitle">{profile.stats.following}</ThemedText>
              <ThemedText>Following</ThemedText>
            </View>
          </View>
        </View>
        {/* Message Button */}
        <TouchableOpacity style={styles.messageButton} onPress={handleMessagePress}>
          <Ionicons name="send" size={20} color="#fff" />
          <ThemedText style={styles.messageButtonText}>Message</ThemedText>
        </TouchableOpacity>
        
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
  messageButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    gap: 8,
  },
  messageButtonText: {
    color: '#fff',
    fontWeight: 'bold',
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

