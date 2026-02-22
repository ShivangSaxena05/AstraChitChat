import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { del, get, post } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

interface UserProfile {
  username: string;
  profilePicture: string;
  bio: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
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
  const router = useRouter();
  const colorScheme = useColorScheme();

  // useFocusEffect will refetch data every time the screen comes into view
  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          console.log('Fetching other user profile:', `/users/${userId}`);
          const userData = await get(`/users/${userId}`);
          console.log('User data received:', userData);
          setUser(userData);
          // Fetch follow status separately
          const followStatus = await get(`/follow/${userId}/check`);
          setIsFollowing(followStatus.isFollowing);
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

  const handleFollow = async () => {
    try {
      await post(`/follow/${userId}`, {});
      // Refetch user data to get updated follower count and follow status
      const updatedUserData = await get(`/users/${userId}`);
      const followStatus = await get(`/follow/${userId}/check`);
      setUser(updatedUserData);
      setIsFollowing(followStatus.isFollowing);
    } catch (error: any) {
      console.error('Follow error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to follow user');
    }
  };

  const handleUnfollow = async () => {
    try {
      await del(`/follow/${userId}`);
      // Refetch user data to get updated follower count and follow status
      const updatedUserData = await get(`/users/${userId}`);
      const followStatus = await get(`/follow/${userId}/check`);
      setUser(updatedUserData);
      setIsFollowing(followStatus.isFollowing);
    } catch (error: any) {
      console.error('Unfollow error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to unfollow user');
    }
  };

  const handleMessage = async () => {
    try {
      if (!userId) {
        Alert.alert('Error', 'User ID is missing. Cannot start chat.');
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
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    profileImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    statsContainer: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    stat: {
      alignItems: 'center',
    },
    statNumber: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#ccc' : 'gray',
    },
    bioContainer: {
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    username: {
      fontWeight: 'bold',
      marginBottom: 4,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    button: {
      flex: 1,
      marginHorizontal: 4,
      backgroundColor: colorScheme === 'dark' ? '#333' : '#efefef',
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    followButton: {
      backgroundColor: '#4ADDAE',
    },
    followButtonText: {
      color: '#fff',
      fontWeight: 'bold',
    },
    messageButton: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#efefef',
    },
    messageButtonText: {
      color: colorScheme === 'dark' ? '#fff' : '#000',
      fontWeight: 'bold',
    },
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
    activeTab: {
      backgroundColor: '#4ADDAE',
    },
    tabText: {
      fontSize: 16,
      color: colorScheme === 'dark' ? '#ccc' : 'gray',
    },
    activeTabText: {
      color: '#fff',
      fontWeight: 'bold',
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
    reportContainer: {
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    reportButton: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#efefef',
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    reportButtonText: {
      color: colorScheme === 'dark' ? '#fff' : '#000',
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
      {/* Profile Header */}
      <View style={styles.header}>
        <Image source={{ uri: user.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.profileImage} />
        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <ThemedText style={styles.statNumber}>{user.stats.posts}</ThemedText>
            <ThemedText style={styles.statLabel}>Posts</ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statNumber}>{user.stats.followers}</ThemedText>
            <ThemedText style={styles.statLabel}>Followers</ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statNumber}>{user.stats.following}</ThemedText>
            <ThemedText style={styles.statLabel}>Following</ThemedText>
          </View>
        </View>
      </View>

      {/* Bio Section */}
      <View style={styles.bioContainer}>
        <ThemedText style={styles.username}>{user.username}</ThemedText>
        <ThemedText>{user.bio}</ThemedText>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {isFollowing ? (
          <>
            <TouchableOpacity style={[styles.button, styles.messageButton]} onPress={handleMessage}>
              <ThemedText style={styles.messageButtonText}>Message</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={handleUnfollow}>
              <ThemedText style={{ color: '#ff4444', fontWeight: 'bold' }}>Unfollow</ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.button, styles.followButton]} onPress={handleFollow}>
            <ThemedText style={styles.followButtonText}>Follow</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {/* Report Button */}
      <View style={styles.reportContainer}>
        <TouchableOpacity style={styles.reportButton} onPress={handleReport}>
          <ThemedText style={styles.reportButtonText}>Report User</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
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
    </ThemedView>
  );
}
