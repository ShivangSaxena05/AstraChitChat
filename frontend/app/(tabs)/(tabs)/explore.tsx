import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/services/api';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import { TextCard } from '@/components/TextCard';
import { useTheme } from '@/hooks/use-theme-color';

const isDesktopLayout = (width: number) => width > 900;

const CATEGORY_TABS = [
  { id: 'for-you', label: 'For You' },
  { id: 'trending', label: 'Trending' },
  { id: 'videos', label: 'Videos' },
  { id: 'posts', label: 'Posts' },
  { id: 'tech', label: 'Tech' },
  { id: 'music', label: 'Music' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExplorePost {
  _id: string;
  mediaUrl?: string;
  caption: string;
  type?: 'video' | 'photo' | 'text';
  duration?: string;
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  createdAt: string;
  likes?: number;
  comments?: number;
  hashtags?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatViewCount = (count?: number): string => {
  if (!count) return '0 views';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count} views`;
};

const formatTimeAgo = (date?: string | null): string => {
  if (!date || typeof date !== 'string') return 'Recently';
  try {
    const now = new Date();
    const postDate = new Date(date);
    if (isNaN(postDate.getTime())) return 'Recently';
    const diffMs = now.getTime() - postDate.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return postDate.toLocaleDateString();
  } catch {
    return 'Recently';
  }
};

const isVideo = (item?: ExplorePost | null): boolean => {
  if (!item || !item.mediaUrl) return false;
  try {
    return (
      item.type === 'video' ||
      (typeof item.mediaUrl === 'string' &&
        /\.(mp4|mov|avi|mkv|webm|flv|m3u8|3gp)/i.test(item.mediaUrl))
    );
  } catch {
    return false;
  }
};

const isTextOnly = (item?: ExplorePost | null): boolean => {
  return !!(item?.type === 'text' || (!item?.mediaUrl && item?.caption));
};

// ─── Video Card ───────────────────────────────────────────────────────────────
const VideoCard = ({
  item,
  colors,
  onPress,
  isExpanded,
  onToggleExpand,
}: {
  item: ExplorePost;
  colors: ReturnType<typeof useTheme>;
  onPress: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) => (
  <TouchableOpacity
    style={[styles.videoCard, { backgroundColor: colors.card }]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    {/* paddingBottom: '56.25%' forces 16:9 ratio on both web and native */}
    <View style={styles.videoThumbnailOuter}>
      <Image
        source={{ uri: item.mediaUrl || 'https://picsum.photos/seed/' + item._id + '/320/180' }}
        style={styles.videoThumbnailInner}
        resizeMode="cover"
      />
      {item.duration && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{item.duration}</Text>
        </View>
      )}
    </View>

    <View style={styles.videoInfoRow}>
      <Image
        source={{ uri: item.user.profilePicture || `https://i.pravatar.cc/150?u=${item.user._id}` }}
        style={styles.videoAvatar}
      />
      <View style={styles.videoTextBlock}>
        <ThemedText
          numberOfLines={isExpanded ? 0 : 2}
          style={[styles.videoTitle, { color: colors.text }]}
        >
          {item.caption || 'Untitled'}
        </ThemedText>
        {(item.caption?.length || 0) > 80 && (
          <TouchableOpacity onPress={onToggleExpand}>
            <Text style={[styles.expandBtn, { color: colors.tint }]}>
              {isExpanded ? 'Show less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.videoChannel, { color: colors.textSecondary }]}>
          {item.user.username}
        </Text>
        <Text style={[styles.videoMeta, { color: colors.textTertiary }]}>
          {formatViewCount(item.likes)} • {formatTimeAgo(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.videoMenuBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
);

// ─── Post Card ────────────────────────────────────────────────────────────────
const PostCard = ({
  item,
  colors,
  onPress,
  isExpanded,
  onToggleExpand,
}: {
  item: ExplorePost;
  colors: ReturnType<typeof useTheme>;
  onPress: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) => (
  <TouchableOpacity
    style={[styles.postCard, { backgroundColor: colors.card }]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    {/* paddingBottom: '100%' forces 1:1 square ratio on both web and native */}
    <View style={styles.postImageOuter}>
      <Image
        source={{ uri: item.mediaUrl || `https://i.pravatar.cc/150?u=${item._id}` }}
        style={styles.postImageInner}
        resizeMode="cover"
      />
      <View style={styles.postLikesOverlay}>
        <Ionicons name="heart" size={14} color="#ff006e" />
        <Text style={styles.postLikesText}>{(item.likes || 0).toLocaleString()}</Text>
      </View>
    </View>

    <View style={styles.postMeta}>
      <View style={styles.postUserRow}>
        <Image
          source={{ uri: item.user.profilePicture || `https://i.pravatar.cc/150?u=${item.user._id}` }}
          style={styles.postAvatar}
        />
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.postUsername, { color: colors.text }]}>
            {item.user.username}
          </ThemedText>
          <Text style={[styles.postTime, { color: colors.textTertiary }]}>
            {formatTimeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
      <ThemedText
        numberOfLines={isExpanded ? 0 : 2}
        style={[styles.postCaption, { color: colors.text }]}
      >
        {item.caption || 'No caption'}
      </ThemedText>
      {(item.caption?.length || 0) > 80 && (
        <TouchableOpacity onPress={onToggleExpand}>
          <Text style={[styles.expandBtn, { color: colors.tint }]}>
            {isExpanded ? 'Show less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
      <View style={[styles.postActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.postActionBtn}>
          <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.postActionLabel, { color: colors.textSecondary }]}>
            {(item.likes || 0) > 999 ? `${(item.likes! / 1000).toFixed(1)}K` : item.likes || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.postActionBtn}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.postActionLabel, { color: colors.textSecondary }]}>
            {(item.comments || 0) > 999
              ? `${(item.comments! / 1000).toFixed(1)}K`
              : item.comments || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.postActionBtn}>
          <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.postActionLabel, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const router = require('expo-router').useRouter();
  const { q } = require('expo-router').useLocalSearchParams();
  const dimensions = useWindowDimensions();
  const isDesktop = isDesktopLayout(dimensions.width);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('for-you');
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const colors = useTheme();

  // Responsive column count
  const numColumns = isDesktop
    ? dimensions.width >= 1280 ? 4
    : dimensions.width >= 960  ? 3
    : 2
    : 1;

  const validatePost = (post: any): post is ExplorePost => {
    return (
      post &&
      typeof post === 'object' &&
      typeof post._id === 'string' &&
      (typeof post.mediaUrl === 'string' || post.mediaUrl === null || post.mediaUrl === undefined) &&
      post.user &&
      typeof post.user.username === 'string' &&
      typeof post.createdAt === 'string'
    );
  };

  const fetchExplorePosts = async (pageNum = 1, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);
      setError(null);
      const data = await api.get(`/posts/feed?page=${pageNum}&category=${selectedCategory}`);
      if (!data || typeof data !== 'object') throw new Error('Invalid API response');
      const rawPosts = Array.isArray(data.posts) ? data.posts : [];
      const validPosts = rawPosts.filter(validatePost);
      if (isRefresh || pageNum === 1) {
        setPosts(validPosts);
      } else {
        setPosts(prev => [...prev, ...validPosts]);
      }
      setHasMore(data.hasMore !== false && validPosts.length >= 10);
      setPage(pageNum);
    } catch (err: any) {
      console.error('Fetch explore posts error:', err);
      if (pageNum === 1) {
        setError(err?.message || 'Failed to load posts');
        setPosts([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const performSearch = async (query: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (!query.trim()) {
      setPosts([]);
      setLoading(false);
      setError(null);
      return;
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/search?q=${encodeURIComponent(query)}&limit=20`);
      if (signal.aborted) return;
      const rawPosts = Array.isArray(response.posts) ? response.posts : [];
      const validPosts = rawPosts.filter(validatePost);
      setPosts(validPosts.length > 0 ? validPosts : []);
      if (validPosts.length === 0) setError(`No results found for "${query}"`);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError('Search failed. Please try again.');
      setPosts([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  useEffect(() => { fetchExplorePosts(); }, []);
  useEffect(() => { if (q) setSearchQuery(String(q)); }, [q]);

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    if (searchQuery.trim().length > 0) {
      debounceTimeout.current = setTimeout(() => performSearch(searchQuery), 400);
    } else {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setPage(1);
      setError(null);
      fetchExplorePosts(1, false);
    }
    return () => { if (debounceTimeout.current) clearTimeout(debounceTimeout.current); };
  }, [searchQuery]);

  const handleLoadMore = () => {
    if (!loading && hasMore && !searchQuery.trim()) fetchExplorePosts(page + 1);
  };

  const handleRefresh = () => { setPage(1); fetchExplorePosts(1, true); };

  const handlePostPress = (item: ExplorePost) => {
    router.push({ pathname: '/post/detail', params: { postId: item._id } });
  };

  const toggleExpand = (id: string) => {
    setExpandedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = ({ item }: { item: ExplorePost }) => {
    if (!validatePost(item)) {
      return (
        <View style={styles.gridItemWrapper}>
          <View style={{ backgroundColor: '#f0f0f0', height: 200, borderRadius: 12 }} />
        </View>
      );
    }
    const isExpanded = expandedPostIds.has(item._id);
    return (
      <View style={styles.gridItemWrapper}>
        {isVideo(item) ? (
          <VideoCard
            item={item}
            colors={colors}
            onPress={() => handlePostPress(item)}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(item._id)}
          />
        ) : isTextOnly(item) ? (
          <TextCard
            item={item}
            colors={colors}
            onPress={() => handlePostPress(item)}
          />
        ) : (
          <PostCard
            item={item}
            colors={colors}
            onPress={() => handlePostPress(item)}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(item._id)}
          />
        )}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <TopHeaderComponent />

      {/* Sticky header */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.background }]}>
        {/* Search bar */}
        <View style={[styles.searchBarContainer, { borderBottomColor: colors.border }]}>
          <View
            style={[styles.searchBarContent, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity>
              <Ionicons name="mic" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={{ marginLeft: 8 }}>
              <Ionicons name="person-circle" size={24} color={colors.tint} />
            </TouchableOpacity>
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginLeft: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORY_TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.categoryTab,
                selectedCategory === tab.id && [
                  styles.categoryTabActive,
                  { backgroundColor: colors.tint },
                ],
              ]}
              onPress={() => {
                setSelectedCategory(tab.id);
                setPage(1);
                setLoading(true);
                setError(null);
                fetchExplorePosts(1, false);
              }}
            >
              <Text
                style={[
                  styles.categoryTabText,
                  { color: selectedCategory === tab.id ? '#fff' : colors.textSecondary },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Feed */}
      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : error && posts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={52} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.tint }]}
            onPress={() => { setError(null); setPage(1); fetchExplorePosts(1, true); }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length > 0 ? (
        <FlatList
          data={posts}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          numColumns={numColumns}
          key={`flatlist-${numColumns}`}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={isDesktop ? styles.gridContent : styles.feedContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading && posts.length > 0 ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.tint} />
              </View>
            ) : null
          }
        />
      ) : searchQuery.trim() ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={52} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No results for "{searchQuery}"
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Try different keywords
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="sparkles" size={52} color={colors.tint} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Discover Amazing Content</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>Pull to refresh</Text>
        </View>
      )}
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  feedContent: { paddingBottom: 100 },
  gridContent: { paddingHorizontal: 12, paddingVertical: 16, paddingBottom: 100 },

  gridItemWrapper: {
    flex: 1,
    marginBottom: 5,
  },
  columnWrapper: { gap: 12 },

  stickyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  searchBarContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },

  categoryScroll: { height: 48 },
  categoryContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  categoryTabActive: { borderWidth: 0 },
  categoryTabText: { fontSize: 13, fontWeight: '600' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── Video Card ────────────────────────────────────────────────────────────────
  videoCard: { borderRadius: 12, overflow: 'hidden' },
  videoThumbnailOuter: {
    width: '100%',
    paddingBottom: '56.25%' as any, // 16:9 ratio — works on web and native
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  videoThumbnailInner: {
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 3,
  },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  videoInfoRow: {
    flexDirection: 'row',
    paddingHorizontal: 10, paddingVertical: 10,
    gap: 10, alignItems: 'flex-start',
  },
  videoAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ccc' },
  videoTextBlock: { flex: 1 },
  videoTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3, lineHeight: 18 },
  expandBtn: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  videoChannel: { fontSize: 12, marginBottom: 2 },
  videoMeta: { fontSize: 11 },
  videoMenuBtn: { paddingHorizontal: 6, paddingVertical: 4 },

  // ── Post Card ─────────────────────────────────────────────────────────────────
  postCard: { borderRadius: 12, overflow: 'hidden' },
  postImageOuter: {
    width: '100%',
    paddingBottom: '100%' as any, // 1:1 ratio — works on web and native
    backgroundColor: '#f0f0f0',
    position: 'relative',
    overflow: 'hidden',
  },
  postImageInner: {
    position: 'absolute',
    top: 0, left: 0,
    width: '100%', height: '100%',
  },
  postLikesOverlay: {
    position: 'absolute',
    bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 6, alignItems: 'center', gap: 4,
  },
  postLikesText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  postMeta: { paddingHorizontal: 10, paddingVertical: 10, gap: 6 },
  postUserRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  postAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ddd' },
  postUsername: { fontSize: 13, fontWeight: '700' },
  postTime: { fontSize: 11 },
  postCaption: { fontSize: 12, lineHeight: 16, marginVertical: 4 },
  postActions: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 6, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  postActionLabel: { fontSize: 12, fontWeight: '600' },
});