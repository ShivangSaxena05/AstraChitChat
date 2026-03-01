import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

// --- IMPORTS ---
// Assuming these paths are correct for your project structure
import PostCard from '@/components/PostCard';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';

// Import all required UI components for the header structure
import SearchBarComponent from '@/components/SearchBarComponent';
import StoriesReelsComponent from '@/components/StoriesReelsComponent';
import TopHeaderComponent from '@/components/TopHeaderComponent';


// --- INTERFACE ---
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

// --- EXPLORE SCREEN COMPONENT ---
export default function ExploreScreen({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    // Initial fetch on component mount
    setLoading(true);
    fetchPosts();
  }, []);

  /**
   * Fetches posts from the API with pagination support.
   * @param pageNum The page number to fetch.
   * @param isRefresh Flag to indicate a full refresh (clear current posts).
   */
  const fetchPosts = async (pageNum = 1, isRefresh = false) => {
    // Ensure that if we are refreshing or loading for the first time,
    // we don't accidentally load page > 1 data.
    if (pageNum === 1) {
        setHasMore(true); // Reset hasMore state on initial load/refresh
    }

    try {
      const data = await get(`/posts/feed?page=${pageNum}`);

      if (isRefresh) {
        setPosts(data.posts);
      } else {
        setPosts(prevPosts => [...prevPosts, ...data.posts]);
      }

      // Assuming pageSize is 10. If fetched array length is less, it's the last page.
      const pageSize = 10;
      setHasMore(data.posts.length === pageSize);

      setPage(pageNum); // Update page only on successful fetch

    } catch (error: any) {
      console.error('API Error:', error.response?.data || error.message);
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch posts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Handles pull-to-refresh action.
   */
  const handleRefresh = useCallback(() => {
    if (loading) return;
    setRefreshing(true);
    fetchPosts(1, true); // Reset to page 1 and clear existing posts
  }, [loading]);

  /**
   * Handles infinite scrolling by loading the next page.
   */
  const handleLoadMore = useCallback(() => {
    // Only load more if not currently loading AND there are more posts to fetch
    if (!loading && hasMore) {
      setLoading(true); // Set loading true immediately to prevent duplicate calls
      const nextPage = page + 1;
      fetchPosts(nextPage);
    }
  }, [loading, hasMore, page]);

  // --- Post Action Handlers (To be implemented) ---
  const handleLike = (postId: string) => { console.log('Like post:', postId); };
  const handleComment = (postId: string) => { console.log('Comment on post:', postId); };
  const handleShare = (postId: string) => { console.log('Share post:', postId); };

  // --- FlatList Render Functions ---

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard
      post={item}
      onLike={handleLike}
      onComment={handleComment}
      onShare={handleShare}
    />
  );

  /**
   * Renders the loading indicator at the end of the list.
   */
  const renderFooter = () => {
    if (!loading || !hasMore || posts.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#4ADDAE" />
        <Text style={styles.footerText}>Loading more posts...</Text>
      </View>
    );
  };

  /**
   * Renders a message when the post list is empty (and not loading).
   */
  const renderEmpty = () => {
    if (loading || refreshing) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No posts yet. Be the first to share something!</Text>
      </View>
    );
  };

  // Initial full-screen loading state check (before any posts are rendered)
  if (posts.length === 0 && loading && !refreshing) {
    return (
      <ThemedView style={styles.container}>
        {!isEmbedded && (
          <View style={styles.header}>
            <TopHeaderComponent />
            <SearchBarComponent />
            <StoriesReelsComponent />
          </View>
        )}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADDAE" />
          <Text style={styles.loadingText}>Fetching initial posts...</Text>
        </View>
      </ThemedView>
    );
  }

// --- MAIN RENDER ---
  return (
    <ThemedView style={styles.container}>
      {/* Header with Search Bar */}
      {!isEmbedded && (
        <View style={styles.header}>
          <TopHeaderComponent />
          <SearchBarComponent />
          <StoriesReelsComponent />
        </View>
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item._id}

        // --- Infinite Scroll/Refresh Props ---
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#4ADDAE"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Assuming a dark background
  },
  header: {
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: {
    color: '#888',
    marginLeft: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
