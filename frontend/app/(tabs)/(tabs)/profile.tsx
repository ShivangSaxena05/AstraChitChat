import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { del, get, post } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, Modal, Platform, Share, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View, useColorScheme, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserProfile {
  _id?: string;
  username: string;
  profilePicture: string;
  bio: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
  };
}

interface UserPost {
  _id: string;
  mediaUrl: string;
  mediaType: string;
}

interface ListUser {
  _id: string;
  username: string;
  name: string;
  profilePicture: string;
}

type TabType = 'posts' | 'videos' | 'reels';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 4) / 3;

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const router = useRouter();
  const colorScheme = useColorScheme();

  // Overlay card state – null = hidden, 'followers' | 'following' = visible
  const [overlayType, setOverlayType] = useState<'followers' | 'following' | null>(null);
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // List data states
  const [followersList, setFollowersList] = useState<ListUser[]>([]);
  const [followingList, setFollowingList] = useState<ListUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Derived helpers – keep legacy names so existing handler calls still work
  const followersModalVisible = overlayType === 'followers';
  const followingModalVisible = overlayType === 'following';
  const setFollowersModalVisible = (v: boolean) => openOverlay(v ? 'followers' : null);
  const setFollowingModalVisible = (v: boolean) => openOverlay(v ? 'following' : null);

  const openOverlay = (type: 'followers' | 'following' | null) => {
    if (type) {
      setOverlayType(type);
      Animated.spring(overlayAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(overlayAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setOverlayType(null));
    }
  };

  // Selected user profile state
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserPosts, setSelectedUserPosts] = useState<UserPost[]>([]);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedUserActiveTab, setSelectedUserActiveTab] = useState<TabType>('posts');

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
          console.error('Error response:', error.response);
          Alert.alert('Error', error.response?.data?.message || 'Failed to fetch profile data.');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [])
  );

  const fetchFollowers = useCallback(async () => {
    if (!user?._id) return;
    try {
      setListLoading(true);
      const data = await get(`/follow/${user._id}/followers`);
      setFollowersList(data.followers || []);
    } catch (error: any) {
      console.error('Fetch followers error:', error);
      Alert.alert('Error', 'Failed to fetch followers');
    } finally {
      setListLoading(false);
    }
  }, [user?._id]);

  const fetchFollowing = useCallback(async () => {
    if (!user?._id) return;
    try {
      setListLoading(true);
      const data = await get(`/follow/${user._id}/following`);
      setFollowingList(data.following || []);
    } catch (error: any) {
      console.error('Fetch following error:', error);
      Alert.alert('Error', 'Failed to fetch following');
    } finally {
      setListLoading(false);
    }
  }, [user?._id]);

  const handleFollowersPress = () => {
    if (user?._id) {
      fetchFollowers();
      setFollowersModalVisible(true);
    }
  };

  const handleFollowingPress = () => {
    if (user?._id) {
      fetchFollowing();
      setFollowingModalVisible(true);
    }
  };

  const handleUserPress = async (selectedUserId: string) => {
    setSelectedUserId(selectedUserId);
    setProfileModalVisible(true);
    await fetchSelectedUserProfile(selectedUserId);
  };

  const fetchSelectedUserProfile = async (userId: string) => {
    try {
      setSelectedUserLoading(true);
      const userData = await get(`/users/${userId}`);
      setSelectedUser(userData);

      const followStatus = await get(`/follow/${userId}/check`);
      setIsFollowing(followStatus.isFollowing);

      setSelectedUserPosts([]);
    } catch (error: any) {
      console.error('Fetch user profile error:', error);
      Alert.alert('Error', 'Failed to fetch user profile');
    } finally {
      setSelectedUserLoading(false);
    }
  };

  const fetchSelectedUserFollowers = async (userId: string) => {
    try {
      setListLoading(true);
      const data = await get(`/follow/${userId}/followers`);
      setFollowersList(data.followers || []);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch followers");
    } finally {
      setListLoading(false);
    }
  };

  const fetchSelectedUserFollowing = async (userId: string) => {
    try {
      setListLoading(true);
      const data = await get(`/follow/${userId}/following`);
      setFollowingList(data.following || []);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch following");
    } finally {
      setListLoading(false);
    }
  };

  // const handleFollow = async () => {
  //   if (!selectedUserId) return;
  //   try {
  //     await post(`/follow/${selectedUserId}`, {});
  //     const updatedUserData = await get(`/users/${selectedUserId}`);
  //     const followStatus = await get(`/follow/${selectedUserId}/check`);
  //     setSelectedUser(updatedUserData);
  //     setIsFollowing(followStatus.isFollowing);
  //   } catch (error: any) {
  //     console.error('Follow error:', error);
  //     Alert.alert('Error', error.response?.data?.message || 'Failed to follow user');
  //   }
  // };

  const handleFollow = async () => {
    if (!selectedUserId) return;

    try {
      await post(`/follow/${selectedUserId}`, {});

      const [updatedUserData, followStatus, updatedMe] = await Promise.all([
        get(`/users/${selectedUserId}`),
        get(`/follow/${selectedUserId}/check`),
        get(`/profile/me`)
      ]);

      setSelectedUser(updatedUserData);
      setIsFollowing(followStatus.isFollowing);
      setUser(updatedMe);

    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.message || "Failed to follow user");
    }
  };

  // const handleUnfollow = async () => {
  //   if (!selectedUserId) return;
  //   try {
  //     await del(`/follow/${selectedUserId}`);
  //     const updatedUserData = await get(`/users/${selectedUserId}`);
  //     const followStatus = await get(`/follow/${selectedUserId}/check`);
  //     setSelectedUser(updatedUserData);
  //     setIsFollowing(followStatus.isFollowing);
  //   } catch (error: any) {
  //     console.error('Unfollow error:', error);
  //     Alert.alert('Error', error.response?.data?.message || 'Failed to unfollow user');
  //   }
  // };

  const handleUnfollow = async () => {
    if (!selectedUserId) return;

    try {
      await del(`/follow/${selectedUserId}`);

      const [updatedUserData, followStatus, updatedMe] = await Promise.all([
        get(`/users/${selectedUserId}`),
        get(`/follow/${selectedUserId}/check`),
        get(`/profile/me`)
      ]);

      setSelectedUser(updatedUserData);
      setIsFollowing(followStatus.isFollowing);
      setUser(updatedMe);

    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.message || "Failed to unfollow user");
    }
  };

  const handleMessage = async () => {
    if (!selectedUserId || !selectedUser) return;
    try {
      const currentUserId = await AsyncStorage.getItem('userId');
      if (!currentUserId) throw new Error('Current user not found');
      if (currentUserId === selectedUserId) {
        Alert.alert('Error', 'You cannot start a chat with yourself.');
        return;
      }

      // POST /chats/create already handles find-or-create (returns existing chat if one exists)
      const data = await post('/chats/create', { participants: [currentUserId, selectedUserId] });
      const chatId = data._id;

      setProfileModalVisible(false);
      router.push({
        pathname: '/chat/detail',
        params: {
          chatId,
          otherUserId: selectedUserId,
          otherUsername: selectedUser.username || ''
        }
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
    }
  };

  const handleRefreshList = async (type: 'followers' | 'following') => {
    setRefreshing(true);
    if (type === 'followers') {
      await fetchFollowers();
    } else {
      await fetchFollowing();
    }
    setRefreshing(false);
  };

  const handleShareProfile = async () => {
    if (!user) return;
    const profileLink = `https://astra.app/user/${user.username}`;

    try {
      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({
            title: "Astra Profile",
            text: `Check out ${user.username}'s profile`,
            url: profileLink,
          });
        } else {
          await navigator.clipboard.writeText(profileLink);
          alert("Profile link copied to clipboard!");
        }
      } else {
        await Share.share({
          message: `Check out my Astra profile 👇\n${profileLink}`,
        });
      }
    } catch (error) {
      console.log("Share error:", error);
    }
  };

  const handleCloseProfileModal = () => {
    setSelectedUserActiveTab('posts');
    setProfileModalVisible(false);
    setSelectedUserId(null);
    setSelectedUser(null);
    setIsFollowing(false);
  };

  const getFilteredPosts = () => {
    switch (activeTab) {
      case 'posts':
        return posts.filter(post => post.mediaType === 'image');
      case 'videos':
        return posts.filter(post => post.mediaType === 'video');
      case 'reels':
        return posts.filter(post => post.mediaType === 'flick'); // Post model uses 'flick' not 'reel'
      default:
        return posts;
    }
  };

  const getSelectedUserFilteredPosts = () => {
    switch (selectedUserActiveTab) {
      case 'posts':
        return selectedUserPosts.filter(post => post.mediaType === 'image');
      case 'videos':
        return selectedUserPosts.filter(post => post.mediaType === 'video');
      case 'reels':
        return selectedUserPosts.filter(post => post.mediaType === 'flick'); // Post model uses 'flick' not 'reel'
      default:
        return selectedUserPosts;
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

  const renderUserItem = ({ item }: { item: ListUser }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleUserPress(item._id)}
    >
      <Image
        source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }}
        style={styles.avatar}
      />
      <View style={styles.userInfo}>
        <ThemedText style={styles.username}>{item.username}</ThemedText>
        <ThemedText style={styles.name}>{item.name}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = (type: 'followers' | 'following') => (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyText}>
        {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        {type === 'followers'
          ? 'When someone follows you, they will appear here.'
          : 'Start following people to see them here.'}
      </ThemedText>
    </View>
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

  const renderSelectedUserEmptyState = () => (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyText}>
        {selectedUserActiveTab === 'posts' && 'No posts yet'}
        {selectedUserActiveTab === 'videos' && 'No videos yet'}
        {selectedUserActiveTab === 'reels' && 'No reels yet'}
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
    buttonText: {
      fontWeight: 'bold',
      color: colorScheme === 'dark' ? '#fff' : '#000',
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
    // ── Overlay card styles ──
    overlayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    overlayCard: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '72%',
      backgroundColor: colorScheme === 'dark' ? '#111318' : '#ffffff',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 20,
      overflow: 'hidden',
    },
    overlayHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colorScheme === 'dark' ? '#444' : '#ddd',
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 6,
    },
    overlayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#2a2a2a' : '#ebebeb',
    },
    overlayTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    overlayCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    overlayCloseText: {
      fontSize: 14,
      fontWeight: '700',
      color: colorScheme === 'dark' ? '#aaa' : '#555',
    },
    overlayCountRow: {
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    overlayCountBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colorScheme === 'dark' ? '#1e2a25' : '#edfaf5',
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    overlayCountText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#4ADDAE',
    },
    overlayUserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#1e1e1e' : '#f2f2f2',
    },
    overlayAvatarRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      borderColor: '#4ADDAE',
      padding: 2,
      marginRight: 14,
    },
    overlayAvatar: {
      width: '100%',
      height: '100%',
      borderRadius: 22,
    },
    overlayUserInfo: {
      flex: 1,
    },
    overlayUserName: {
      fontSize: 15,
      fontWeight: '600',
    },
    overlayUserSub: {
      fontSize: 13,
      color: colorScheme === 'dark' ? '#888' : '#999',
      marginTop: 1,
    },
    overlayChevron: {
      fontSize: 22,
      color: colorScheme === 'dark' ? '#555' : '#ccc',
      fontWeight: '300',
    },
    overlayLoadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    overlayLoadingText: {
      color: colorScheme === 'dark' ? '#888' : '#999',
      fontSize: 14,
    },
    overlayEmptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      gap: 10,
    },
    overlayEmptyIcon: {
      fontSize: 40,
    },
    overlayEmptyText: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    overlayEmptySubtext: {
      fontSize: 13,
      color: colorScheme === 'dark' ? '#666' : '#999',
      textAlign: 'center',
    },
    // Legacy user-item styles (still used by renderUserItem in the profile-view modal)
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginRight: 12,
    },
    userInfo: {
      flex: 1,
    },
    name: {
      fontSize: 14,
      opacity: 0.7,
      color: colorScheme === 'dark' ? '#ccc' : '#666',
    },
    listEmptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // Profile modal header / title (used by selected-user profile modal)
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    closeButton: { padding: 8 },
    closeButtonText: {
      fontSize: 24,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    // Profile modal styles
    profileModalContainer: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#0d0f14' : '#fff',
    },
    profileModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
    },
    profileModalCloseButton: {
      padding: 8,
    },
    profileModalCloseText: {
      fontSize: 24,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    profileContent: {
      flex: 1,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    profileImageLarge: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    profileStatsContainer: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    profileStat: {
      alignItems: 'center',
    },
    profileStatNumber: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    profileStatLabel: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#ccc' : 'gray',
    },
    profileBioContainer: {
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    profileUsername: {
      fontWeight: 'bold',
      fontSize: 18,
      marginBottom: 4,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    profileBio: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#ccc' : '#666',
    },
    profileButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    profileButton: {
      flex: 1,
      marginHorizontal: 4,
      paddingVertical: 10,
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
    unfollowButton: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#efefef',
    },
    unfollowButtonText: {
      color: '#ff4444',
      fontWeight: 'bold',
    },
    messageButton: {
      backgroundColor: colorScheme === 'dark' ? '#333' : '#efefef',
    },
    messageButtonText: {
      color: colorScheme === 'dark' ? '#fff' : '#000',
      fontWeight: 'bold',
    },
    profileTabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    profileTab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    profileActiveTab: {
      backgroundColor: '#4ADDAE',
    },
    profileTabText: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#ccc' : 'gray',
    },
    profileActiveTabText: {
      color: '#fff',
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
          <TouchableOpacity style={styles.stat} onPress={handleFollowersPress}>
            <ThemedText style={styles.statNumber}>{user.stats.followers}</ThemedText>
            <ThemedText style={styles.statLabel}>Followers</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stat} onPress={handleFollowingPress}>
            <ThemedText style={styles.statNumber}>{user.stats.following}</ThemedText>
            <ThemedText style={styles.statLabel}>Following</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bio Section */}
      <View style={styles.bioContainer}>
        <ThemedText style={styles.username}>{user.username}</ThemedText>
        <ThemedText>{user.bio}</ThemedText>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile/edit')}>
          <ThemedText style={styles.buttonText}>Edit Profile</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleShareProfile}>
          <ThemedText style={styles.buttonText}>Share Profile</ThemedText>
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

      {/* ── Followers / Following Overlay Card ── */}
      <Modal
        visible={overlayType !== null}
        transparent
        animationType="none"
        onRequestClose={() => openOverlay(null)}
      >
        <TouchableWithoutFeedback onPress={() => openOverlay(null)}>
          <Animated.View
            style={[
              styles.overlayBackdrop,
              { opacity: overlayAnim }
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.overlayCard,
            {
              transform: [{
                translateY: overlayAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [500, 0],
                })
              }]
            }
          ]}
        >
          {/* Handle bar */}
          <View style={styles.overlayHandle} />

          {/* Header */}
          <View style={styles.overlayHeader}>
            <ThemedText style={styles.overlayTitle}>
              {overlayType === 'followers' ? 'Followers' : 'Following'}
            </ThemedText>
            <TouchableOpacity onPress={() => openOverlay(null)} style={styles.overlayCloseBtn}>
              <ThemedText style={styles.overlayCloseText}>✕</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Count badge */}
          <View style={styles.overlayCountRow}>
            <View style={styles.overlayCountBadge}>
              <ThemedText style={styles.overlayCountText}>
                {overlayType === 'followers'
                  ? `${followersList.length} follower${followersList.length !== 1 ? 's' : ''}`
                  : `${followingList.length} following`}
              </ThemedText>
            </View>
          </View>

          {/* List */}
          {listLoading ? (
            <View style={styles.overlayLoadingContainer}>
              <ActivityIndicator size="large" color="#4ADDAE" />
              <ThemedText style={styles.overlayLoadingText}>Loading...</ThemedText>
            </View>
          ) : (
            <FlatList
              data={overlayType === 'followers' ? followersList : followingList}
              keyExtractor={(item) => item._id}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => overlayType && handleRefreshList(overlayType)}
                  tintColor="#4ADDAE"
                />
              }
              contentContainerStyle={
                (overlayType === 'followers' ? followersList : followingList).length === 0
                  ? styles.overlayEmptyContainer
                  : { paddingBottom: 20 }
              }
              ListEmptyComponent={() => (
                <View style={styles.overlayEmptyContainer}>
                  <ThemedText style={styles.overlayEmptyIcon}>
                    {overlayType === 'followers' ? '👥' : '🔍'}
                  </ThemedText>
                  <ThemedText style={styles.overlayEmptyText}>
                    {overlayType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                  </ThemedText>
                  <ThemedText style={styles.overlayEmptySubtext}>
                    {overlayType === 'followers'
                      ? 'When people follow you, they\'ll appear here.'
                      : 'Start following people to see them here.'}
                  </ThemedText>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.overlayUserRow}
                  onPress={() => {
                    openOverlay(null);
                    setTimeout(() => handleUserPress(item._id), 250);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Avatar with teal ring */}
                  <View style={styles.overlayAvatarRing}>
                    <Image
                      source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150?u=' + item._id }}
                      style={styles.overlayAvatar}
                    />
                  </View>

                  {/* Text */}
                  <View style={styles.overlayUserInfo}>
                    <ThemedText style={styles.overlayUserName}>
                      {item.username || item.name}
                    </ThemedText>
                    {item.username && item.name && item.username !== item.name && (
                      <ThemedText style={styles.overlayUserSub}>{item.name}</ThemedText>
                    )}
                  </View>

                  {/* Chevron */}
                  <ThemedText style={styles.overlayChevron}>›</ThemedText>
                </TouchableOpacity>
              )}
            />
          )}
        </Animated.View>
      </Modal>

      {/* User Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        onRequestClose={handleCloseProfileModal}
      >
        <View style={styles.profileModalContainer}>
          <View style={styles.profileModalHeader}>
            <View style={{ width: 40 }} />
            <ThemedText style={styles.modalTitle}>Profile</ThemedText>
            <TouchableOpacity
              style={styles.profileModalCloseButton}
              onPress={handleCloseProfileModal}
            >
              <ThemedText style={styles.profileModalCloseText}>✕</ThemedText>
            </TouchableOpacity>
          </View>

          {selectedUserLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
            </View>
          ) : selectedUser ? (
            <ScrollView style={styles.profileContent}>
              {/* Profile Header */}
              <View style={styles.profileHeader}>
                <Image source={{ uri: selectedUser.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.profileImageLarge} />
                <View style={styles.profileStatsContainer}>
                  <View style={styles.profileStat}>
                    <ThemedText style={styles.profileStatNumber}>{selectedUser.stats.posts}</ThemedText>
                    <ThemedText style={styles.profileStatLabel}>Posts</ThemedText>
                  </View>
                  <TouchableOpacity style={styles.profileStat} onPress={() => {
                    if (selectedUserId) {
                      fetchSelectedUserFollowers(selectedUserId);
                      setFollowersModalVisible(true);
                    }
                  }}>
                    <ThemedText style={styles.profileStatNumber}>{selectedUser.stats.followers}</ThemedText>
                    <ThemedText style={styles.profileStatLabel}>Followers</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.profileStat} onPress={() => {
                    if (selectedUserId) {
                      fetchSelectedUserFollowing(selectedUserId);
                      setFollowingModalVisible(true);
                    }
                  }}>
                    <ThemedText style={styles.profileStatNumber}>{selectedUser.stats.following}</ThemedText>
                    <ThemedText style={styles.profileStatLabel}>Following</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bio Section */}
              <View style={styles.profileBioContainer}>
                <ThemedText style={styles.profileUsername}>{selectedUser.username}</ThemedText>
                <ThemedText style={styles.profileBio}>{selectedUser.bio}</ThemedText>
              </View>

              {/* Action Buttons */}
              <View style={styles.profileButtonContainer}>
                {isFollowing ? (
                  <>
                    <TouchableOpacity style={[styles.profileButton, styles.messageButton]} onPress={handleMessage}>
                      <ThemedText style={styles.messageButtonText}>Message</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.profileButton, styles.unfollowButton]} onPress={handleUnfollow}>
                      <ThemedText style={styles.unfollowButtonText}>Unfollow</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={[styles.profileButton, styles.followButton]} onPress={handleFollow}>
                    <ThemedText style={styles.followButtonText}>Follow</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              {/* Tab Navigation */}
              <View style={styles.profileTabContainer}>
                <TouchableOpacity
                  style={[styles.profileTab, selectedUserActiveTab === 'posts' && styles.profileActiveTab]}
                  onPress={() => setSelectedUserActiveTab('posts')}
                >
                  <ThemedText style={[styles.profileTabText, selectedUserActiveTab === 'posts' && styles.profileActiveTabText]}>📷 Posts</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.profileTab, selectedUserActiveTab === 'videos' && styles.profileActiveTab]}
                  onPress={() => setSelectedUserActiveTab('videos')}
                >
                  <ThemedText style={[styles.profileTabText, selectedUserActiveTab === 'videos' && styles.profileActiveTabText]}>🎥 Videos</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.profileTab, selectedUserActiveTab === 'reels' && styles.profileActiveTab]}
                  onPress={() => setSelectedUserActiveTab('reels')}
                >
                  <ThemedText style={[styles.profileTabText, selectedUserActiveTab === 'reels' && styles.profileActiveTabText]}>🎬 Reels</ThemedText>
                </TouchableOpacity>
              </View>

              {/* User Posts Grid */}
              <FlatList
                data={getSelectedUserFilteredPosts()}
                renderItem={renderPostItem}
                keyExtractor={(item) => item._id}
                numColumns={3}
                ListEmptyComponent={renderSelectedUserEmptyState}
                scrollEnabled={false}
              />
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <ThemedText>Could not load profile.</ThemedText>
            </View>
          )}
        </View>
      </Modal>
    </ThemedView>
  );
}

