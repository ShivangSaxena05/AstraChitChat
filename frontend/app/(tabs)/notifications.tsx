import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import { useTheme } from '@/hooks/use-theme-color';
import { NotificationSkeleton } from '@/components/NotificationSkeleton';

interface Notification {
  _id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'system';
  from?: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  post?: {
    _id: string;
    mediaUrl: string;
  };
  message: string;
  createdAt: string;
  read: boolean;
}

interface GroupedNotification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'system' | 'group';
  users: Notification['from'][];
  count: number;
  post?: Notification['post'];
  message: string;
  createdAt: string;
  read: boolean;
  notifications: Notification[];
  isGrouped: boolean;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [groupedNotifications, setGroupedNotifications] = useState<GroupedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [followRequestsCount, setFollowRequestsCount] = useState(0);
  const router = useRouter();
  const colors = useTheme();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const groupNotifications = (notifs: Notification[]): GroupedNotification[] => {
    // Sort by createdAt descending
    const sorted = [...notifs].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const grouped: { [key: string]: Notification[] } = {};

    sorted.forEach(notif => {
      // Group by: type + postId + time window (1 hour)
      const timestamp = new Date(notif.createdAt).getTime();
      const timeWindow = Math.floor(timestamp / (60 * 60 * 1000)); // 1 hour windows
      const postId = notif.post?._id || 'no-post';
      const key = `${notif.type}-${postId}-${timeWindow}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(notif);
    });

    // Convert grouped object to array of GroupedNotification
    return Object.values(grouped).map((group) => {
      const firstNotif = group[0];
      const uniqueUsers = Array.from(
        new Map((group.map(n => n.from?._id) || []).map((id, idx) => [id, group.find(n => n.from?._id === id)?.from])).values()
      ).filter((u): u is Notification['from'] => !!u);

      // Generate appropriate message based on count and type
      let message = firstNotif.message;
      if (group.length > 1) {
        const otherCount = group.length - 1;
        switch (firstNotif.type) {
          case 'like':
            message = `${firstNotif.from?.username} and ${otherCount} other${otherCount > 1 ? 's' : ''} liked your post`;
            break;
          case 'comment':
            message = `${firstNotif.from?.username} and ${otherCount} other${otherCount > 1 ? 's' : ''} commented on your post`;
            break;
          case 'follow':
            message = `${firstNotif.from?.username} and ${otherCount} other${otherCount > 1 ? 's' : ''} started following you`;
            break;
          case 'mention':
            message = `${firstNotif.from?.username} and ${otherCount} other${otherCount > 1 ? 's' : ''} mentioned you`;
            break;
          default:
            message = firstNotif.message;
        }
      }

      return {
        id: group.map(n => n._id).join('-'),
        type: group.length > 1 ? 'group' : firstNotif.type,
        users: uniqueUsers,
        count: group.length,
        post: firstNotif.post,
        message,
        createdAt: firstNotif.createdAt,
        read: group.every(n => n.read),
        notifications: group,
        isGrouped: group.length > 1,
      };
    });
  };

  const fetchNotifications = async (pageNum = 1, isRefresh = false) => {
    if (pageNum === 1) {
      setHasMore(true);
      // Fetch follow requests count
      try {
        const reqs = await get('/follow/requests');
        setFollowRequestsCount(reqs.requests?.length || 0);
      } catch (e) {
        console.log('Error fetching follow reqs:', e);
      }
    }

    try {
      const data = await get(`/notifications?page=${pageNum}`);
      
      let updatedNotifications: Notification[];
      if (isRefresh) {
        updatedNotifications = data.notifications || [];
      } else {
        updatedNotifications = [...notifications, ...(data.notifications || [])];
      }

      setNotifications(updatedNotifications);
      setGroupedNotifications(groupNotifications(updatedNotifications));

      const pageSize = 20;
      setHasMore((data.notifications || []).length === pageSize);
      setPage(pageNum);
    } catch (error: any) {
      console.error('API Error:', error.response?.data || error.message);
      if (isRefresh || pageNum === 1) {
        const mockNotifs = getMockNotifications();
        setNotifications(mockNotifs);
        setGroupedNotifications(groupNotifications(mockNotifs));
      }
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    if (loading) return;
    setRefreshing(true);
    fetchNotifications(1, true);
  }, [loading]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      setLoading(true);
      fetchNotifications(page + 1);
    }
  }, [loading, hasMore, page]);

  const handleNotificationPress = (notification: GroupedNotification) => {
    if (!notification.read) {
      // Mark all grouped notifications as read
      const updatedNotifs = notifications.map(n => {
        if (notification.notifications.find(gn => gn._id === n._id)) {
          return { ...n, read: true };
        }
        return n;
      });
      setNotifications(updatedNotifs);
      setGroupedNotifications(groupNotifications(updatedNotifs));
    }

    // Get the actual type (use first notification's type if grouped)
    const type = notification.notifications[0]?.type || notification.type;
    const firstNotif = notification.notifications[0];

    switch (type) {
      case 'like':
      case 'comment':
      case 'mention':
        if (notification.post) {
          router.push({ pathname: '/', params: { postId: notification.post._id } });
        }
        break;
      case 'follow':
        if (notification.users && notification.users.length > 0) {
          // For single follow, go to profile; for multiple, show a list or go to followers
          const userId = notification.users[0]?._id;
          if (userId) {
            router.push({ pathname: '/(tabs)/(tabs)/other-profile', params: { userId } });
          }
        }
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return '❤️';
      case 'comment': return '💬';
      case 'follow': return '👤';
      case 'mention': return '@';
      default: return '📢';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: GroupedNotification }) => {
    const displayUser = item.users[0];
    const hasMultipleUsers = item.users.length > 1;

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={styles.iconContainer}>
          {displayUser?.profilePicture ? (
            <Image source={{ uri: displayUser.profilePicture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.iconText}>{getNotificationIcon(item.notifications[0]?.type)}</Text>
            </View>
          )}
          {hasMultipleUsers && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{item.count}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.content}>
          <Text style={styles.message}>
            {displayUser ? <Text style={styles.username}>{displayUser.username}</Text> : null}
            {hasMultipleUsers && <Text style={styles.username}> +{item.count - 1}</Text>}
            {' '}{item.message}
          </Text>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>

        {item.post && (
          <Image source={{ uri: item.post.mediaUrl }} style={styles.thumbnail} />
        )}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (followRequestsCount === 0) return null;
    return (
      <TouchableOpacity
        style={styles.followRequestBanner}
        onPress={() => router.push('/profile/follow-requests')}
      >
        <Text style={styles.followRequestText}>Follow Requests ({followRequestsCount})</Text>
        <Text style={styles.followRequestArrow}>→</Text>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading || !hasMore || notifications.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading || refreshing) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.emptyText}>No notifications yet</Text>
        <Text style={styles.emptySubtext}>When you get notifications, they&apos;ll show up here</Text>
      </View>
    );
  };

  if (loading && notifications.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <TopHeaderComponent />
        <FlatList
          data={[1, 2, 3, 4, 5]}
          renderItem={() => <NotificationSkeleton />}
          keyExtractor={(_, i) => `skeleton-${i}`}
          scrollEnabled={true}
          showsVerticalScrollIndicator={false}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Top Header with username switcher */}
      <TopHeaderComponent />
      
      <FlatList
        data={groupedNotifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
}

function getMockNotifications(): Notification[] {
  const baseTime = Date.now();
  return [
    { _id: '1', type: 'like', from: { _id: 'user1', username: 'john_doe', profilePicture: 'https://via.placeholder.com/50' }, post: { _id: 'post1', mediaUrl: 'https://via.placeholder.com/50' }, message: 'liked your post', createdAt: new Date(baseTime - 1000 * 60 * 5).toISOString(), read: false },
    { _id: '1b', type: 'like', from: { _id: 'user1b', username: 'jane_smith', profilePicture: 'https://via.placeholder.com/50' }, post: { _id: 'post1', mediaUrl: 'https://via.placeholder.com/50' }, message: 'liked your post', createdAt: new Date(baseTime - 1000 * 60 * 4).toISOString(), read: false },
    { _id: '1c', type: 'like', from: { _id: 'user1c', username: 'alex_wilson', profilePicture: 'https://via.placeholder.com/50' }, post: { _id: 'post1', mediaUrl: 'https://via.placeholder.com/50' }, message: 'liked your post', createdAt: new Date(baseTime - 1000 * 60 * 3).toISOString(), read: false },
    { _id: '2', type: 'comment', from: { _id: 'user2', username: 'sarah_jones', profilePicture: 'https://via.placeholder.com/50' }, post: { _id: 'post2', mediaUrl: 'https://via.placeholder.com/50' }, message: 'commented: "Great photo!"', createdAt: new Date(baseTime - 1000 * 60 * 30).toISOString(), read: false },
    { _id: '2b', type: 'comment', from: { _id: 'user2b', username: 'mike_brown', profilePicture: 'https://via.placeholder.com/50' }, post: { _id: 'post2', mediaUrl: 'https://via.placeholder.com/50' }, message: 'commented: "Love this!"', createdAt: new Date(baseTime - 1000 * 60 * 20).toISOString(), read: false },
    { _id: '3', type: 'follow', from: { _id: 'user3', username: 'emma_taylor', profilePicture: 'https://via.placeholder.com/50' }, message: 'started following you', createdAt: new Date(baseTime - 1000 * 60 * 60 * 2).toISOString(), read: true },
    { _id: '3b', type: 'follow', from: { _id: 'user3b', username: 'chris_davis', profilePicture: 'https://via.placeholder.com/50' }, message: 'started following you', createdAt: new Date(baseTime - 1000 * 60 * 60 * 1.5).toISOString(), read: true },
    { _id: '4', type: 'system', message: 'Welcome to AstraChitChat! Start connecting with friends.', createdAt: new Date(baseTime - 1000 * 60 * 60 * 24).toISOString(), read: true }
  ];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  followRequestBanner: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  followRequestText: { fontWeight: 'bold', fontSize: 16 },
  followRequestArrow: { fontSize: 18, fontWeight: 'bold' },
  notificationItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
  unreadItem: { },
  iconContainer: { marginRight: 12, position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  badgeContainer: { position: 'absolute', bottom: -4, right: -4, backgroundColor: '#FF6B6B', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ffffff' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  iconText: { fontSize: 20 },
  content: { flex: 1 },
  username: { fontWeight: 'bold', color: '#ffffff' },
  message: { color: '#b8b8b8', fontSize: 14 },
  time: { color: '#888888', fontSize: 12, marginTop: 4 },
  thumbnail: { width: 48, height: 48, borderRadius: 8, marginLeft: 8 },
  footer: { padding: 20, alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, color: '#ffffff', fontWeight: 'bold', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#888888', textAlign: 'center', paddingHorizontal: 40 },
});

