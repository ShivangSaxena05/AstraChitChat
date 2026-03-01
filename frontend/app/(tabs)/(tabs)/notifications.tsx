import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import TopHeaderComponent from '@/components/TopHeaderComponent';

// --- INTERFACE ---
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

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async (pageNum = 1, isRefresh = false) => {
    if (pageNum === 1) {
      setHasMore(true);
    }

    try {
      const data = await get(`/notifications?page=${pageNum}`);
      
      if (isRefresh) {
        setNotifications(data.notifications || []);
      } else {
        setNotifications(prev => [...prev, ...(data.notifications || [])]);
      }

      const pageSize = 20;
      setHasMore((data.notifications || []).length === pageSize);
      setPage(pageNum);
    } catch (error: any) {
      console.error('API Error:', error.response?.data || error.message);
      // Properly set as empty or use mock data without getting stuck in a loading loop
      if (isRefresh || pageNum === 1) {
        setNotifications(getMockNotifications());
      }
      setHasMore(false); // Make sure we dont try to load more if it fails
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

  const handleNotificationPress = (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      setNotifications(prev => 
        prev.map(n => n._id === notification._id ? { ...n, read: true } : n)
      );
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'mention':
        if (notification.post) {
          // Navigate to post detail
          router.push({ pathname: '/', params: { postId: notification.post._id } });
        }
        break;
      case 'follow':
        if (notification.from) {
          router.push({ pathname: '/(tabs)/(tabs)/other-profile', params: { userId: notification.from._id } });
        }
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return '❤️';
      case 'comment':
        return '💬';
      case 'follow':
        return '👤';
      case 'mention':
        return '@';
      default:
        return '📢';
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

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadItem]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.iconContainer}>
        {item.from?.profilePicture ? (
          <Image source={{ uri: item.from.profilePicture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.iconText}>{getNotificationIcon(item.type)}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.content}>
        <Text style={styles.message}>
          {item.from ? (
            <Text style={styles.username}>{item.from.username}</Text>
          ) : null}
          {' '}{item.message}
        </Text>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
      </View>

      {item.post && (
        <Image source={{ uri: item.post.mediaUrl }} style={styles.thumbnail} />
      )}
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (!loading || !hasMore || notifications.length === 0) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#4ADDAE" />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading || refreshing) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔔</Text>
        <Text style={styles.emptyText}>No notifications yet</Text>
        <Text style={styles.emptySubtext}>When you get notifications, they'll show up here</Text>
      </View>
    );
  };

  if (loading && notifications.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <TopHeaderComponent />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADDAE" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      </ThemedView>
    );
  }

  // --- MAIN RENDER ---
  return (
    <ThemedView style={styles.container}>
      <TopHeaderComponent />
      
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#4ADDAE"
            colors={['#4ADDAE']}
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

// --- MOCK DATA ---
function getMockNotifications(): Notification[] {
  return [
    {
      _id: '1',
      type: 'like',
      from: {
        _id: 'user1',
        username: 'john_doe',
        profilePicture: 'https://via.placeholder.com/50'
      },
      post: {
        _id: 'post1',
        mediaUrl: 'https://via.placeholder.com/50'
      },
      message: 'liked your post',
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      read: false
    },
    {
      _id: '2',
      type: 'comment',
      from: {
        _id: 'user2',
        username: 'jane_smith',
        profilePicture: 'https://via.placeholder.com/50'
      },
      post: {
        _id: 'post2',
        mediaUrl: 'https://via.placeholder.com/50'
      },
      message: 'commented: "Great photo!"',
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      read: false
    },
    {
      _id: '3',
      type: 'follow',
      from: {
        _id: 'user3',
        username: 'alex_wilson',
        profilePicture: 'https://via.placeholder.com/50'
      },
      message: 'started following you',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      read: true
    },
    {
      _id: '4',
      type: 'system',
      message: 'Welcome to AstraChitChat! Start connecting with friends.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      read: true
    }
  ];
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 10,
    fontSize: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#000',
  },
  unreadItem: {
    backgroundColor: '#111',
  },
  iconContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  username: {
    fontWeight: 'bold',
    color: '#fff',
  },
  message: {
    color: '#ccc',
    fontSize: 14,
  },
  time: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginLeft: 8,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

