import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Share, StyleSheet, TouchableOpacity, View, useColorScheme, Animated, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface UserProfile {
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
const GRID_ITEM_SIZE = (width - 4) / 3; // Subtracting margins

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const colorScheme = useColorScheme();

  // useFocusEffect will refetch data every time the screen comes into view
  useFocusEffect(
    React.useCallback(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          // Fetch current user's profile and posts
          const [userData, postsData] = await Promise.all([
            get('/profile/me'), // Endpoint to get current user's profile
            get('/posts/me'),   // Endpoint to get current user's posts
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

  const handleShareProfile = async () => {
    try {
      await Share.share({
        message: `Check out ${user?.username}'s profile!`,
        url: `https://yourapp.com/profile/${user?.username}`,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to share profile');
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

  const HEADER_MAX_HEIGHT = 160;
  const HEADER_MIN_HEIGHT = 90;
  
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT],
    outputRange: [0, -HEADER_MAX_HEIGHT + HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-160, 0, HEADER_MAX_HEIGHT],
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
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      alignItems: 'center', // Center everything in the top header section
      paddingHorizontal: 16,
      marginTop: -55, // Pull up over the cover photo
    },
    profileImage: {
      width: 110,
      height: 110,
      borderRadius: 55,
      borderWidth: 4,
      borderColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
      backgroundColor: colorScheme === 'dark' ? '#333' : '#eee', // guarantee bg behind transparent pngs
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginTop: 20,
      paddingHorizontal: 10,
    },
    stat: {
      alignItems: 'center',
      flex: 1,
    },
    statNumber: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    statLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: colorScheme === 'dark' ? '#8e8e93' : '#8e8e93',
    },
    bioContainer: {
      alignItems: 'center', // Center all bio elements
      paddingHorizontal: 20,
      marginTop: 20,
      marginBottom: 24,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    nameText: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    pronounBadge: {
      backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      marginLeft: 8,
    },
    pronounText: {
      fontSize: 11,
      fontWeight: '600',
      color: colorScheme === 'dark' ? '#bbb' : '#555',
    },
    username: {
      fontSize: 13,
      fontWeight: '500',
      color: colorScheme === 'dark' ? '#8e8e93' : '#8e8e93',
      marginBottom: 10,
    },
    bioText: {
      fontSize: 14,
      textAlign: 'center',
      color: colorScheme === 'dark' ? '#d1d1d6' : '#333',
      lineHeight: 20,
      marginBottom: 14,
    },
    metadataRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 12,
    },
    metadataItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metadataText: {
      fontSize: 12,
      fontWeight: '500',
      color: colorScheme === 'dark' ? '#8e8e93' : '#666',
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginVertical: 10,
      gap: 10,
    },
    button: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#2c2c2e' : '#e5e5ea',
    },
    buttonText: {
      fontWeight: '600',
      fontSize: 13,
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
      paddingHorizontal: 20,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#e5e5ea',
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
    },
    activeTab: {
      borderBottomWidth: 2,
      borderBottomColor: colorScheme === 'dark' ? '#fff' : '#000',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colorScheme === 'dark' ? '#8e8e93' : '#8e8e93',
    },
    activeTabText: {
      color: colorScheme === 'dark' ? '#fff' : '#000',
      fontWeight: '700',
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
    headerContentWrapper: {
      backgroundColor: colorScheme === 'dark' ? '#0a0a0a' : '#fff',
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      marginTop: -24, // Create a stronger card overlap effect
      paddingTop: 12,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: -4,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    },
    coverPhotoContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 160,
      zIndex: -1,
    },
    coverPhotoImage: {
      width: '100%',
      height: '100%',
    },
    coverPhotoPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colorScheme === 'dark' ? '#111' : '#e1e1e1',
    },
    coverPhotoOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.1)', // subtle darkening
    },
  }), [colorScheme]);

  if (loading) {
    return <ThemedView style={styles.loadingContainer}><ActivityIndicator size="large" /></ThemedView>;
  }

  if (!user) {
    return <ThemedView style={styles.loadingContainer}><ThemedText>Could not load profile.</ThemedText></ThemedView>;
  }

  const renderHeader = () => (
    <View style={styles.headerContentWrapper}>
      <View style={styles.header}>
        {/* Profile Avatar */}
        {!user.profilePicture || user.profilePicture.includes('anonymous-avatar-icon') || user.profilePicture.includes('pravatar.cc') ? (
          <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={60} color={colorScheme === 'dark' ? '#aaa' : '#888'} />
          </View>
        ) : (
           <Image source={{ uri: user.profilePicture }} style={styles.profileImage} />
        )}

        {/* Stats Section moved right below avatar */}
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
          {user.stats.posts > 0 && (
             <View style={styles.stat}>
               <ThemedText style={styles.statNumber}>{user.stats.likes}</ThemedText>
               <ThemedText style={styles.statLabel}>Likes</ThemedText>
             </View>
          )}
        </View>
      </View>

      {/* Bio Section */}
      <View style={styles.bioContainer}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.nameText}>{user.name || user.username}</ThemedText>
          {user.pronouns ? <View style={styles.pronounBadge}><ThemedText style={styles.pronounText}>{user.pronouns}</ThemedText></View> : null}
        </View>
        
        {user.name ? <ThemedText style={styles.username}>@{user.username}</ThemedText> : null}
        
        {user.bio ? <ThemedText style={styles.bioText}>{user.bio}</ThemedText> : null}
        
        <View style={styles.metadataRow}>
          {user.location ? (
            <View style={styles.metadataItem}>
              <Ionicons name="location-outline" size={14} color={colorScheme === 'dark' ? '#aaa' : '#666'} />
              <ThemedText style={styles.metadataText}>{user.location}</ThemedText>
            </View>
          ) : null}
          
          {user.website ? (
            <TouchableOpacity style={styles.metadataItem} onPress={() => openWebsite(user.website!)}>
              <Ionicons name="link-outline" size={14} color="#007AFF" />
              <ThemedText style={[styles.metadataText, { color: '#007AFF' }]}>{user.website.replace(/^https?:\/\//, '')}</ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/profile/edit' as any)}>
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
          <ThemedText style={[styles.tabText, activeTab === 'posts' && styles.activeTabText]}>Posts</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
          onPress={() => setActiveTab('videos')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'videos' && styles.activeTabText]}>Videos</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reels' && styles.activeTab]}
          onPress={() => setActiveTab('reels')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'reels' && styles.activeTabText]}>Reels</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      
      {/* Animated Parallax Cover Photo */}
      <Animated.View style={[styles.coverPhotoContainer, { transform: [{ translateY: headerTranslateY }] }]}>
        {user.coverPhoto ? (
          <Animated.Image 
            source={{ uri: user.coverPhoto }} 
            style={[styles.coverPhotoImage, { transform: [{ scale: imageScale }] }]} 
          />
        ) : (
          <Animated.View 
            style={[styles.coverPhotoPlaceholder, { transform: [{ scale: imageScale }] }]} 
          />
        )}
        <View style={styles.coverPhotoOverlay} />
      </Animated.View>

      {/* Post Grid with Parallax Scroll Support */}
      <Animated.FlatList
        data={getFilteredPosts()}
        renderItem={renderPostItem}
        keyExtractor={(item: UserPost) => item._id}
        numColumns={3}
        style={styles.grid}
        contentContainerStyle={{ paddingTop: HEADER_MAX_HEIGHT }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      />
    </ThemedView>
  );
}
