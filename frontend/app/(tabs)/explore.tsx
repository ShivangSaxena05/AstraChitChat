import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  Animated,
  ListRenderItemInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { TextCard } from '@/components/TextCard';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import { get as apiGet } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';
import PostCard, { Post } from '@/components/PostCard';

interface ExplorePost extends Post {
  duration?: number | null;
}

interface FeedResponse {
  posts: ExplorePost[];
  hasMore: boolean;
  total?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE        = 10;
const SEARCH_DEBOUNCE  = 400; // ms
const END_THRESHOLD    = 0.5;

const CATEGORY_TABS = [
  { id: 'for-you',  label: 'For You'  },
  { id: 'trending', label: 'Trending' },
  { id: 'videos',   label: 'Videos'   },
  { id: 'images',   label: 'Images'   },
  { id: 'posts',    label: 'Posts'    },
] as const;

type CategoryId = (typeof CATEGORY_TABS)[number]['id'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatViewCount = (n?: number): string => {
  if (!n || n <= 0) return '0 views';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
};

const formatTimeAgo = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0)           return 'just now';
    if (diff < 60_000)      return 'just now';
    if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
};

/** Returns true when a post's media is a video */
const isVideoPost = (item: ExplorePost): boolean =>
  item.mediaType === 'video' ||
  item.type === 'video' ||
  (!!item.mediaUrl && /\.(mp4|mov|avi|mkv|webm|flv|m3u8|3gp)/i.test(item.mediaUrl));

/** Returns true when post has no media (text-only) */
const isTextOnlyPost = (item: ExplorePost): boolean =>
  item.mediaType === 'text' || (!item.mediaUrl && !!item.caption);

/** Runtime guard — keeps bad API data from crashing the UI */
const isValidPost = (p: unknown): p is ExplorePost => {
  if (!p || typeof p !== 'object') return false;
  const post = p as Record<string, unknown>;
  return (
    typeof post._id      === 'string' &&
    typeof post.caption  === 'string' &&
    typeof post.createdAt === 'string' &&
    !!post.user &&
    typeof (post.user as any).username === 'string'
  );
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

const SkeletonBlock = memo(({ width, height, radius = 6, color }: {
  width: number | string;
  height: number;
  radius?: number;
  color: string;
}) => {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{ width: width as any, height, borderRadius: radius, backgroundColor: color, opacity }}
    />
  );
});

const PostSkeleton = memo(({ colors }: { colors: ReturnType<typeof useTheme> }) => {
  const bg = colors.backgroundSecondary ?? '#e0e0e0';
  return (
    <View style={[skeletonStyles.card, { backgroundColor: colors.card }]}>
      <View style={skeletonStyles.header}>
        <SkeletonBlock width={36} height={36} radius={18} color={bg} />
        <View style={skeletonStyles.headerText}>
          <SkeletonBlock width={120} height={12} color={bg} />
          <SkeletonBlock width={80}  height={10} color={bg} />
        </View>
      </View>
      <SkeletonBlock width="100%" height={220} radius={0} color={bg} />
      <View style={skeletonStyles.footer}>
        <SkeletonBlock width={200} height={10} color={bg} />
        <SkeletonBlock width={160} height={10} color={bg} />
      </View>
    </View>
  );
});

const skeletonStyles = StyleSheet.create({
  card:       { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  header:     { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center' },
  headerText: { gap: 6, flex: 1 },
  footer:     { padding: 12, gap: 8 },
});

// ─── VideoCard ────────────────────────────────────────────────────────────────

const VideoCard = memo(({
  item, colors, onPress, isExpanded, onToggleExpand,
}: {
  item: ExplorePost;
  colors: ReturnType<typeof useTheme>;
  onPress: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => (
  <TouchableOpacity
    style={[vcStyles.card, { backgroundColor: colors.card }]}
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Video by ${item.user?.username || 'Unknown'}: ${item.caption}`}
  >
    <View style={vcStyles.thumbnailOuter}>
      <Image
        source={{ uri: item.mediaUrl ?? `https://picsum.photos/seed/${item._id}/320/180` }}
        style={vcStyles.thumbnailInner}
        resizeMode="cover"
      />
      <View style={vcStyles.playOverlay}>
        <View style={vcStyles.playButtonCircle}>
          <Ionicons name="play-circle-sharp" size={60} color="rgba(255,255,255,1)" />
        </View>
      </View>
      {item.duration != null && (
        <View style={vcStyles.durationBadge}>
          <Text style={vcStyles.durationText}>
            {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
          </Text>
        </View>
      )}
    </View>

    <View style={vcStyles.infoRow}>
      <Image
        source={{ uri: item.user.profilePicture ?? `https://i.pravatar.cc/150?u=${item.user._id}` }}
        style={vcStyles.avatar}
      />
      <View style={vcStyles.textBlock}>
        <ThemedText
          numberOfLines={isExpanded ? 0 : 2}
          ellipsizeMode="tail"
          style={[vcStyles.title, { color: colors.text }]}
        >
          {item.caption || 'Untitled'}
        </ThemedText>
        {item.caption.length > 80 && (
          <TouchableOpacity onPress={onToggleExpand} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Text style={[vcStyles.expandBtn, { color: colors.tint }]}>
              {isExpanded ? 'Show less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={[vcStyles.channel, { color: colors.textSecondary }]}>
          {item.user.username}
        </Text>
        <Text style={[vcStyles.meta, { color: colors.textTertiary }]}>
          {formatViewCount(item.likes)} · {formatTimeAgo(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        style={vcStyles.menuBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Video options"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

const vcStyles = StyleSheet.create({
  card:           { borderRadius: 14, overflow: 'hidden', marginBottom: 2 },
  thumbnailOuter: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111', position: 'relative', overflow: 'hidden' },
  thumbnailInner: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  playOverlay:    { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  playButtonCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  durationBadge:  { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  durationText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  infoRow:        { flexDirection: 'row', padding: 10, gap: 10, alignItems: 'flex-start' },
  avatar:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ccc', overflow: 'hidden', flexShrink: 0 },
  textBlock:      { flex: 1, gap: 2, marginRight: 8 },
  title:          { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  expandBtn:      { fontSize: 11, fontWeight: '600' },
  channel:        { fontSize: 12 },
  meta:           { fontSize: 11 },
  menuBtn:        { padding: 8, minWidth: 40 },
});

// ─── Custom hook — feed data management ──────────────────────────────────────

function useExploreFeed(category: CategoryId) {
  const [posts,      setPosts]      = useState<ExplorePost[]>([]);
  const [loading,    setLoading]    = useState(true);   // initial / page load
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Track in-flight page to avoid duplicate requests
  const fetchingPage = useRef<number | null>(null);

  const fetchPage = useCallback(async (pageNum: number, isRefresh = false) => {
    // Guard: skip if we're already loading this page
    if (fetchingPage.current === pageNum) return;
    fetchingPage.current = pageNum;

    try {
      if (isRefresh)       setRefreshing(true);
      else if (pageNum === 1) setLoading(true);
      setError(null);

      const data: FeedResponse = await apiGet(
        `/posts/feed?page=${pageNum}&limit=${PAGE_SIZE}&category=${category}`
      );

      if (!data || !Array.isArray(data.posts)) throw new Error('Unexpected API response shape');

      const valid = data.posts.filter(isValidPost);

      setPosts(prev => pageNum === 1 || isRefresh ? valid : [...prev, ...valid]);
      setHasMore(data.hasMore !== false && valid.length >= PAGE_SIZE);
      setPage(pageNum);
    } catch (err: any) {
      if (pageNum === 1) {
        setError(err?.message ?? 'Failed to load posts. Pull down to retry.');
        setPosts([]);
      }
      // For page > 1 silently fail — keeps existing content visible
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingPage.current = null;
    }
  }, [category]);

  // Refetch from page 1 when category changes
  useEffect(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
    setError(null);
    fetchPage(1);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh    = useCallback(() => fetchPage(1, true), [fetchPage]);
  const loadMore   = useCallback(() => {
    if (!loading && !refreshing && hasMore) fetchPage(page + 1);
  }, [loading, refreshing, hasMore, page, fetchPage]);
  const retryFirst = useCallback(() => fetchPage(1), [fetchPage]);

  return { posts, setPosts, loading, refreshing, hasMore, error, refresh, loadMore, retryFirst };
}

// ─── Custom hook — search ─────────────────────────────────────────────────────

function useExploreSearch() {
  const [query,         setQuery]         = useState('');
  const [searchResults, setSearchResults] = useState<ExplorePost[]>([]);
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);

  const abortRef    = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    // Cancel previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setSearching(true);
    setSearchError(null);

    try {
      const res = await apiGet(`/search?q=${encodeURIComponent(q)}&limit=20`);
      if (signal.aborted) return;
      const valid = (Array.isArray(res?.posts) ? res.posts : []).filter(isValidPost);
      setSearchResults(valid);
      if (valid.length === 0) setSearchError(`No results for "${q}"`);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      if (!signal.aborted) setSearching(false);
    }
  }, []);

  // Debounce search triggers
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      abortRef.current?.abort();
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query.trim()), SEARCH_DEBOUNCE);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  return { query, setQuery, searchResults, searching, searchError, clearSearch };
}

// ─── ExploreScreen ────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const router       = useRouter();
  const { q }        = useLocalSearchParams<{ q?: string }>();
  const { width }    = useWindowDimensions();
  const colors       = useTheme();

  const [category,        setCategory]        = useState<CategoryId>('for-you');
  const [expandedIds,     setExpandedIds]      = useState<Set<string>>(new Set());

  // Seed search from router param
  const search = useExploreSearch();
  useEffect(() => { if (q) search.setQuery(String(q)); }, [q]); // eslint-disable-line

  const feed = useExploreFeed(category);

  // Responsive column count with dynamic sizing
  const numColumns = useMemo(() => {
    if (width >= 1280) return 4;
    if (width >= 960)  return 3;
    if (width >= 640)  return 2;
    return 1;
  }, [width]);

  // Responsive styling based on screen width
  const isTablet = width >= 600;
  const isDesktop = width >= 960;
  const isLargeDesktop = width >= 1280;

  const isSearching = search.query.trim().length > 0;
  const displayData  = isSearching ? search.searchResults : feed.posts;
  const isLoading    = isSearching ? search.searching     : feed.loading;
  const displayError = isSearching ? search.searchError   : feed.error;

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handlePostPress = useCallback((postId: string) => {
    router.push({ pathname: '/(tabs)', params: { postId } });
  }, [router]);

  const handleCategoryChange = useCallback((id: CategoryId) => {
    setCategory(id);
    search.clearSearch();
  }, [search]);

  const handleClearSearch = useCallback(() => {
    search.clearSearch();
  }, [search]);

  // ── Render item ────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: ListRenderItemInfo<ExplorePost>) => {
    // Runtime guard — should already be filtered, but just in case
    if (!isValidPost(item)) return null;

    const isExpanded = expandedIds.has(item._id);

    return (
      <View style={[
        styles.gridItem, 
        numColumns > 1 && styles.gridItemMulti,
        isTablet && styles.gridItemTablet,
        isDesktop && styles.gridItemDesktop,
        isLargeDesktop && styles.gridItemLargeDesktop,
      ]}>
        {isVideoPost(item) ? (
          <VideoCard
            item={item}
            colors={colors}
            onPress={() => handlePostPress(item._id)}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(item._id)}
          />
        ) : isTextOnlyPost(item) ? (
          <TextCard
            item={item}
            colors={colors}
            onPress={() => handlePostPress(item._id)}
          />
        ) : (
          <PostCard
            post={item}
            onPress={handlePostPress}
            onLikeChange={(id, liked, count) => {
              // Keep feed list in sync after a like from within the card
              feed.setPosts(prev =>
                prev.map(p => p._id === id ? { ...p, likes: count, isLiked: liked } : p)
              );
            }}
          />
        )}
      </View>
    );
  }, [expandedIds, numColumns, colors, handlePostPress, toggleExpand, feed, isTablet, isDesktop, isLargeDesktop]);

  const keyExtractor = useCallback((item: ExplorePost) => item._id, []);

  // ── Skeleton loader ────────────────────────────────────────────────────────
  const renderSkeletons = () => (
    <View style={styles.skeletonList}>
      {Array.from({ length: 4 }).map((_, i) => (
        <PostSkeleton key={i} colors={colors} />
      ))}
    </View>
  );

  // ── Footer (pagination spinner) ────────────────────────────────────────────
  const ListFooter = useMemo(() => {
    if (!feed.loading || feed.posts.length === 0) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }, [feed.loading, feed.posts.length, colors.tint]);

  return (
    <ThemedView style={styles.container}>
      <TopHeaderComponent />

      {/* ── Sticky header (search + tabs) ──────────────────────────────────── */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }, isDesktop && styles.stickyHeaderDesktop]}>

        {/* Search bar */}
        <View style={[styles.searchRow, { borderBottomColor: colors.border }, isDesktop && styles.searchRowDesktop]}>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }, isTablet && styles.searchBoxTablet, isDesktop && styles.searchBoxDesktop]}>
            {search.searching
              ? <ActivityIndicator size="small" color={colors.tint} style={styles.searchIcon} />
              : <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
            }
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search posts, people, topics…"
              placeholderTextColor={colors.textTertiary}
              value={search.query}
              onChangeText={search.setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="never"
              accessibilityLabel="Search"
            />
            {search.query.length > 0 && (
              <TouchableOpacity
                onPress={handleClearSearch}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Clear search"
                style={styles.clearBtn}
              >
                <Ionicons name="close-circle" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category tabs — hidden during active search */}
        {!isSearching && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContent}
          >
            {CATEGORY_TABS.map(tab => {
              const active = tab.id === category;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    { borderColor: colors.border },
                    active && [styles.tabActive, { backgroundColor: colors.tint, borderColor: colors.tint }],
                  ]}
                  onPress={() => handleCategoryChange(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabText, { color: active ? '#fff' : colors.textSecondary }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Content area ───────────────────────────────────────────────────── */}

      {/* Initial skeleton loader */}
      {isLoading && displayData.length === 0 ? (
        renderSkeletons()

      ) : /* Error with no data */ displayError && displayData.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={52} color={colors.textTertiary} />
          <Text style={[styles.stateTitle,    { color: colors.text }]}>{displayError}</Text>
          {!isSearching && (
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.tint }]}
              onPress={feed.retryFirst}
              accessibilityRole="button"
              accessibilityLabel="Retry loading posts"
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>

      ) : /* Feed / search results */ displayData.length > 0 ? (
        <FlatList
          data={displayData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={numColumns}
          // Re-mount FlatList when column count changes (required by RN)
          key={`explore-${numColumns}`}
          columnWrapperStyle={numColumns > 1 ? [styles.columnWrapper, isDesktop && styles.columnWrapperDesktop, isLargeDesktop && styles.columnWrapperLargeDesktop] : undefined}
          contentContainerStyle={[
            styles.feedContent,
            numColumns > 1 && styles.feedContentGrid,
            isTablet && styles.feedContentTablet,
            isDesktop && styles.feedContentDesktop,
          ]}
          refreshControl={
            !isSearching ? (
              <RefreshControl
                refreshing={feed.refreshing}
                onRefresh={feed.refresh}
                tintColor={colors.tint}
                colors={[colors.tint]}
              />
            ) : undefined
          }
          onEndReached={!isSearching ? feed.loadMore : undefined}
          onEndReachedThreshold={END_THRESHOLD}
          ListFooterComponent={ListFooter}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={8}
          initialNumToRender={6}
          updateCellsBatchingPeriod={50}
        />

      ) : /* Empty state */ isSearching ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={52} color={colors.textTertiary} />
          <Text style={[styles.stateTitle,    { color: colors.text }]}>
            No results for "{search.query}"
          </Text>
          <Text style={[styles.stateSubtitle, { color: colors.textTertiary }]}>
            Try different keywords or check the spelling
          </Text>
        </View>
      ) : (
        <View style={styles.centered}>
          <Ionicons name="sparkles" size={52} color={colors.tint} />
          <Text style={[styles.stateTitle,    { color: colors.text }]}>
            Discover Amazing Content
          </Text>
          <Text style={[styles.stateSubtitle, { color: colors.textTertiary }]}>
            Pull down to refresh
          </Text>
        </View>
      )}
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Sticky header
  stickyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 100,
  },
  stickyHeaderDesktop: {
    paddingHorizontal: 20,
  },
  searchRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRowDesktop: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchBoxTablet: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 28,
  },
  searchBoxDesktop: {
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 32,
    maxWidth: 600,
  },
  searchIcon:  { 
    marginRight: 0,
    padding: 4,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: { 
    flex: 1, 
    fontSize: 15,
    paddingVertical: 8,
  },

  // Category tabs
  tabsScroll:   { height: 48 },
  tabsContent:  { paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabActive:  { shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  tabText:    { fontSize: 13, fontWeight: '600' },
  clearBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Feed
  feedContent:     { paddingBottom: 100 },
  feedContentGrid: { paddingHorizontal: 12, paddingTop: 12 },
  feedContentTablet: { paddingHorizontal: 16, paddingTop: 16 },
  feedContentDesktop: { 
    paddingHorizontal: 20, 
    paddingTop: 20,
    paddingBottom: 120,
  },

  gridItem:      { flex: 1, marginBottom: 8 },
  gridItemMulti: { margin: 4 },
  gridItemTablet: { marginBottom: 12 },
  gridItemDesktop: { marginBottom: 16 },
  gridItemLargeDesktop: { marginBottom: 20 },
  columnWrapper: { gap: 8 },
  columnWrapperDesktop: { gap: 12 },
  columnWrapperLargeDesktop: { gap: 16 },

  footerLoader:  { paddingVertical: 20, alignItems: 'center' },
  skeletonList:  { padding: 12, gap: 12 },

  // Centered states
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 10,
  },
  stateTitle:    { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  stateSubtitle: { fontSize: 14, textAlign: 'center' },
  retryBtn:      { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText:  { color: '#fff', fontSize: 14, fontWeight: '600' },
});