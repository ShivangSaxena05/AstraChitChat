import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  Alert, 
  TouchableOpacity, 
  Text, 
  Image, 
  RefreshControl, 
  ActivityIndicator,
  FlatList,
  Modal,
  ViewToken
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { Share } from 'react-native';
import PostCard from '@/components/PostCard';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import SearchBarComponent from '@/components/SearchBarComponent';
import { useSocket } from '@/contexts/SocketContext';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

// --- INTERFACES ---
interface Flick {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    username: string;
    profilePicture: string;
  };
  createdAt: string;
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
  createdAt: string;
  likes: number;
  comments: number;
}

interface SavedAccount {
  userId: string;
  token: string;
  username: string;
  profilePicture: string;
}

// --- HOME SCREEN COMPONENT ---
export default function HomeScreen() {
  const router = useRouter();
  const { connect } = useSocket();

  // Tab state & User state
  const [activeTab, setActiveTab] = useState<'flicks' | 'explore'>('flicks');
  const [currentUsername, setCurrentUsername] = useState<string>('User');
  
  // Account Switcher State
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  
  // Flicks state
  const [flicks, setFlicks] = useState<Flick[]>([]);
  const [flicksLoading, setFlicksLoading] = useState(true);
  const [flicksRefreshing, setFlicksRefreshing] = useState(false);
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState<number | null>(null);
  const [likedFlicks, setLikedFlicks] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: Video }>({});

  // Explore state
  const [posts, setPosts] = useState<Post[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Initial load
  useEffect(() => {
    fetchFlicks();
    fetchUserProfile();
  }, []);

  // Fetch User Profile for header
  const fetchUserProfile = async () => {
    try {
      const data = await get('/profile/me');
      if (data && data.user && data.user.username) {
        setCurrentUsername(data.user.username);
      } else if (data && data.username) {
        // Fallback depending on how the controller structures the response
        setCurrentUsername(data.username);
      }
    } catch (error) {
      console.log('Error fetching user profile for header:', error);
    }
  };

  // --- MULTI-ACCOUNT LOGIC ---
  const loadSavedAccounts = async () => {
    try {
      const accountsStr = await AsyncStorage.getItem('saved_accounts');
      if (accountsStr) {
        setSavedAccounts(JSON.parse(accountsStr));
      }
    } catch (error) {
      console.error('Error loading saved accounts:', error);
    }
  };

  const handleOpenAccountSwitcher = () => {
    loadSavedAccounts();
    setIsAccountModalVisible(true);
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    try {
      // Don't switch if already active
      const currentUserId = await AsyncStorage.getItem('userId');
      if (currentUserId === account.userId) {
        setIsAccountModalVisible(false);
        return;
      }

      // Update active session
      await AsyncStorage.setItem('token', account.token);
      await AsyncStorage.setItem('userId', account.userId);
      setCurrentUsername(account.username); // Instantly update header UI
      setIsAccountModalVisible(false);
      
      // Force socket to disconnect the old user and reconnect as the new user
      await connect(true);
      
      Alert.alert(
        "Account Switched", 
        `Switched to ${account.username}`,
        [{ text: "OK", onPress: () => router.replace('/(tabs)') }] // Quick "reload" via router replacing root
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to switch accounts');
    }
  };

  const handleAddAccount = () => {
    setIsAccountModalVisible(false);
    router.push('/auth/login');
  };

  // Fetch flicks
  const fetchFlicks = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setFlicksRefreshing(true);
      }
      const data = await get('/posts/flicks');
      setFlicks(data.flicks || []);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch flicks');
    } finally {
      setFlicksLoading(false);
      setFlicksRefreshing(false);
    }
  };

  // Fetch posts for explore
  const fetchPosts = async (pageNum = 1, isRefresh = false) => {
    if (pageNum === 1) {
      setHasMore(true);
    }

    try {
      const data = await get(`/posts/feed?page=${pageNum}`);

      if (isRefresh) {
        setPosts(data.posts || []);
      } else {
        setPosts(prev => [...prev, ...(data.posts || [])]);
      }

      const pageSize = 10;
      setHasMore((data.posts || []).length === pageSize);
      setPage(pageNum);
    } catch (error: any) {
      console.error('API Error:', error.response?.data || error.message);
    } finally {
      setExploreLoading(false);
      setExploreRefreshing(false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab: 'flicks' | 'explore') => {
    setActiveTab(tab);
    if (tab === 'explore' && posts.length === 0) {
      setExploreLoading(true);
      fetchPosts();
    }
  };

  // Handle refresh for flicks
  const handleFlicksRefresh = useCallback(() => {
    fetchFlicks(true);
  }, []);

  // Handle refresh for explore
  const handleExploreRefresh = useCallback(() => {
    setExploreRefreshing(true);
    fetchPosts(1, true);
  }, []);

  // Handle load more for explore
  const handleExploreLoadMore = useCallback(() => {
    if (!exploreLoading && hasMore) {
      setExploreLoading(true);
      fetchPosts(page + 1);
    }
  }, [exploreLoading, hasMore, page]);

  // Flicks viewability
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const visibleIndex = viewableItems[0].index;
      setCurrentVisibleIndex(visibleIndex ?? null);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  // Flicks actions
  const handleFlickLike = async (flickId: string) => {
    try {
      await post(`/posts/${flickId}/like`, {});
      setLikedFlicks(prev => {
        const newSet = new Set(prev);
        if (newSet.has(flickId)) {
          newSet.delete(flickId);
        } else {
          newSet.add(flickId);
        }
        return newSet;
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to like flick');
    }
  };

  const handleFlickComment = (flickId: string) => {
    Alert.alert('Coming Soon', 'Comments feature will be available soon!');
  };

  const handleFlickShare = async (flick: Flick) => {
    try {
      await Share.share({
        message: `Check out this flick: ${flick.caption}`,
        url: flick.mediaUrl,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to share flick');
    }
  };

  // Post actions
  const handlePostLike = (postId: string) => {
    console.log('Like post:', postId);
  };

  const handlePostComment = (postId: string) => {
    console.log('Comment on post:', postId);
  };

  const handlePostShare = (postId: string) => {
    console.log('Share post:', postId);
  };

  // --- RENDER FLICK ITEM ---
  const renderFlick = ({ item, index }: { item: Flick; index: number }) => {
    const isVisible = index === currentVisibleIndex;
    const isLiked = likedFlicks.has(item._id);

    return (
      <View style={styles.flickContainer}>
        <Video
          ref={(ref: Video | null) => {
            if (ref) {
              videoRefs.current[item._id] = ref;
            }
          }}
          style={styles.video}
          source={{ uri: item.mediaUrl }}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isVisible}
          isMuted={true}
        />
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            {/* User Info */}
            <View style={styles.userInfo}>
              <Image
                source={{ uri: item.user.profilePicture || 'https://via.placeholder.com/40' }}
                style={styles.avatar}
              />
              <ThemedText type="subtitle" style={styles.username}>
                {item.user.username}
              </ThemedText>
            </View>

            {/* Caption */}
            <View style={styles.captionContainer}>
              <ThemedText style={styles.caption}>{item.caption}</ThemedText>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFlickLike(item._id)}
              >
                <Text style={[styles.actionIcon, isLiked && { color: '#FF6B6B' }]}>
                  {isLiked ? '❤️' : '🤍'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFlickComment(item._id)}
              >
                <Text style={styles.actionIcon}>💬</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleFlickShare(item)}
              >
                <Text style={styles.actionIcon}>📤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // --- RENDER POST ITEM (YouTube style) ---
  const renderPost = ({ item }: { item: Post }) => (
    <View style={styles.postCardContainer}>
      <PostCard
        post={item}
        onLike={handlePostLike}
        onComment={handlePostComment}
        onShare={handlePostShare}
      />
    </View>
  );

  // --- RENDER EXPLORE GRID ITEM ---
  const renderExploreItem = ({ item }: { item: Post }) => (
    <TouchableOpacity style={styles.exploreItem}>
      <Image 
        source={{ uri: item.mediaUrl }} 
        style={styles.exploreThumbnail}
        resizeMode="cover"
      />
      <View style={styles.exploreInfo}>
        <Text style={styles.exploreTitle} numberOfLines={2}>
          {item.caption || 'Untitled'}
        </Text>
        <Text style={styles.exploreMeta}>
          {item.user.username} • {item.likes || 0} likes
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Loading state
  if (flicksLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADDAE" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </ThemedView>
    );
  }

  // --- MAIN RENDER ---
  return (
    <ThemedView style={styles.container}>
      {/* Top Header */}
      <TopHeaderComponent />

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        
        {/* Username Header Selector */}
        <TouchableOpacity 
          style={styles.usernameHeaderSelector} 
          activeOpacity={0.7}
          onPress={handleOpenAccountSwitcher}
        >
          <Text style={styles.usernameHeaderText}>{currentUsername}</Text>
          <Ionicons name="chevron-down" size={20} color="white" style={styles.usernameHeaderIcon} />
        </TouchableOpacity>

        {/* Top Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={styles.tab}
            onPress={() => handleTabChange('flicks')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabTrapezoid, activeTab === 'flicks' ? styles.activeTabTrapezoid : styles.inactiveTabTrapezoid]} />
            {activeTab === 'flicks' && <View style={styles.activeTabGlowLine} />}
            <Text style={[styles.tabText, activeTab === 'flicks' && styles.activeTabText]}>
              Flicks
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.tab}
            onPress={() => handleTabChange('explore')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabTrapezoid, activeTab === 'explore' ? styles.activeTabTrapezoid : styles.inactiveTabTrapezoid]} />
            {activeTab === 'explore' && <View style={styles.activeTabGlowLine} />}
            <Text style={[styles.tabText, activeTab === 'explore' && styles.activeTabText]}>
              Explore
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Indicator Removed for Premium Pill Layout */}

        {/* Content based on active tab */}
        {activeTab === 'flicks' ? (
          // FLICKS CONTENT (TikTok/Reels style)
          flicks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No content available</Text>
            </View>
          ) : (
            <FlatList
              data={flicks}
              renderItem={renderFlick}
              keyExtractor={(item) => item._id}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              snapToAlignment="start"
              decelerationRate="fast"
              refreshControl={
                <RefreshControl
                  refreshing={flicksRefreshing}
                  onRefresh={handleFlicksRefresh}
                  tintColor="#4ADDAE"
                  colors={['#4ADDAE']}
                />
              }
            />
          )
        ) : (
          // EXPLORE CONTENT (YouTube style)
          <>
            <SearchBarComponent />
            <FlatList
              data={posts}
              renderItem={renderPost}
              keyExtractor={(item) => item._id}
              refreshControl={
                <RefreshControl
                  refreshing={exploreRefreshing}
                  onRefresh={handleExploreRefresh}
                  tintColor="#4ADDAE"
                  colors={['#4ADDAE']}
                />
              }
              onEndReached={handleExploreLoadMore}
              onEndReachedThreshold={0.5}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                exploreLoading && posts.length > 0 ? (
                  <ActivityIndicator size="small" color="#4ADDAE" style={styles.footer} />
                ) : null
              }
            />
          </>
        )}
      </View>

      {/* --- MULTI-ACCOUNT BOTTOM SHEET MODAL --- */}
      <Modal
        visible={isAccountModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsAccountModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsAccountModalVisible(false)}
        >
          <View style={styles.bottomSheetModal}>
            <View style={styles.modalDragIndicator} />
            <Text style={styles.modalTitle}>Switch Account</Text>
            
            <FlatList
              data={savedAccounts}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.accountRow}
                  onPress={() => handleSwitchAccount(item)}
                >
                  <Image source={{ uri: item.profilePicture }} style={styles.accountAvatar} />
                  <Text style={styles.accountUsername}>{item.username}</Text>
                  {item.username === currentUsername && (
                    <Ionicons name="checkmark-circle" size={24} color="#4ADDAE" />
                  )}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity style={styles.addAccountButton} onPress={handleAddAccount}>
              <Ionicons name="add-circle-outline" size={24} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.addAccountText}>Add Account</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </ThemedView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#4ADDAE',
    marginTop: 10,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  contentArea: {
    flex: 1,
  },
  
  // Username Header Selector Styles
  usernameHeaderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    zIndex: 15,
  },
  usernameHeaderText: {
    color: '#fff',
    fontSize: 16, // Slightly smaller, more refined
    fontWeight: '600',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  usernameHeaderIcon: {
    marginTop: 2,
  },

  // Tab Styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginTop: 10,
    zIndex: 10,
    height: 48, // Taller to accommodate the trapezoid look comfortably
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  
  // The Trapezoid Background using CSS border tricks
  // React Native supports building triangles/trapezoids via solid borders.
  tabTrapezoid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomWidth: 48, // Matches height
    borderLeftWidth: 15, // Slant amount left
    borderRightWidth: 15, // Slant amount right
    borderTopWidth: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  
  inactiveTabTrapezoid: {
    borderBottomColor: 'rgba(255, 255, 255, 0.05)', // Faintly visible
    zIndex: 1,
  },
  
  activeTabTrapezoid: {
    borderBottomColor: 'rgba(255, 255, 255, 0.15)', // Glassy bright filling
    zIndex: 2,
  },
  
  // A glowing top border line for the active tab (since borders make the trapezoid, we use a separate strip for the glow)
  activeTabGlowLine: {
    position: 'absolute',
    top: 0,
    left: 15,
    right: 15,
    height: 2,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
    zIndex: 3,
  },

  tabText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.4)', 
    zIndex: 4, 
    marginTop: 8, // Push text down a bit into the wider part of the trapezoid
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
    zIndex: 4,
  },
  // Removed underline tab indicators styles for elegant pill design

  // Flicks Styles
  flickContainer: {
    height: screenHeight - 150, // Account for header and tabs
    width: screenWidth,
  },
  video: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayContent: {
    flex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  username: {
    color: '#fff',
    fontWeight: 'bold',
  },
  captionContainer: {
    marginBottom: 20,
  },
  caption: {
    color: '#fff',
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    padding: 10,
  },
  actionIcon: {
    fontSize: 28,
    color: '#fff',
  },

  // Explore Styles
  postCardContainer: {
    marginBottom: 8,
  },
  exploreItem: {
    flex: 1,
    margin: 2,
    aspectRatio: 1,
  },
  exploreThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#222',
  },
  exploreInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  exploreTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  exploreMeta: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
  },
  footer: {
    padding: 20,
  },

  // --- Modal Bottom Sheet Styles ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  bottomSheetModal: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
    minHeight: 250,
  },
  modalDragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#3a3a3c',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  accountUsername: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 10,
  },
  addAccountText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

