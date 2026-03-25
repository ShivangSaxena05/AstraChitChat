import React, { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

interface Chat {
  _id: string;
  participants: {
    _id: string;
    username: string;
    profilePicture: string;
  }[];
  lastMessage: {
    text: string;
    createdAt: string;
    sender: {
      _id: string;
      username: string;
      profilePicture: string;
    };
  };
  unreadCount: number;
  lastReadMsgId: string;
  updatedAt: string;
}

const formatRelativeTime = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'now';
  else if (diffMin < 60) return `${diffMin}m`;
  else if (diffHour < 24) return `${diffHour}h`;
  else if (diffDay < 7) return `${diffDay}d`;
  else return date.toLocaleDateString();
};

// Extracted ChatItem component wrapped in React.memo for FlatList scroll performance
// This prevents every single chat row from re-rendering when only one chat changes
const ChatItem = memo(({ 
  item, 
  onPress, 
  currentUserId 
}: { 
  item: Chat; 
  onPress: () => void;
  currentUserId: string | null;
}) => {
  const otherParticipant = item.participants.find(p => String(p._id) !== String(currentUserId));
  const isFromMe = String(item.lastMessage?.sender?._id) === String(currentUserId);

  const formatLastMessage = () => {
    if (!item.lastMessage?.text) return 'No messages yet';
    if (!isFromMe && item.lastMessage?.sender) {
      return `${item.lastMessage.sender.username || 'User'}: ${item.lastMessage.text}`;
    }
    return isFromMe ? `You: ${item.lastMessage.text}` : item.lastMessage.text;
  };

  const avatarUri = otherParticipant?.profilePicture || `https://i.pravatar.cc/150?u=${otherParticipant?.username || ''}`;
  const formatLastMessagePreview = (text: string) => {
    if (text.length > 60) return text.slice(0, 60) + '…';
    return text;
  };

  return (
    <TouchableOpacity style={styles.chatItem} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image 
          source={{ uri: avatarUri }}
          style={styles.avatar}
        />
        {item.unreadCount > 0 && <View style={styles.unreadDot} />}
      </View>
      
      {/* Info */}
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <ThemedText type="subtitle" style={styles.username} numberOfLines={1} ellipsizeMode="tail">
            {otherParticipant?.username || 'Unknown User'}
          </ThemedText>
          <Text style={styles.timestamp}>
            {formatRelativeTime(item.updatedAt)}
          </Text>
        </View>
        <View style={styles.messageRow}>
          <Text style={[styles.lastMessage, isFromMe && styles.ownMessagePreview, item.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
            {formatLastMessage()}
          </Text>
          <View style={styles.rightSection}>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
{isFromMe && <Text style={styles.readStatus}>✓✓</Text>}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

ChatItem.displayName = 'ChatItem';

export default function ChatListScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Get socket from global SocketContext
  const { conversations, setConversations, currentUserId, socket } = useSocket();
  const router = useRouter();
  // Cast conversations to Chat[] for type safety in this component
  const chats = conversations as Chat[];

  // The socket context handles real-time updates globally.
  // We only fetch chats once on initial mount if the list is empty.
  useEffect(() => {
    if (chats.length === 0) {
      fetchChats(true);
    }
  }, []);
  // SocketContext already handles listening for 'conversationUpdated'
  // and updating the 'conversations' global state. We don't need a local
  // listener here that fetches from the API on every single message.

  // Fetch all chats from server
  const fetchChats = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const data = await get('/chats');
      if (data) {
        // Sort chats by most recent message (lastMessage.createdAt or updatedAt)
        const sorted = data.sort((a: Chat, b: Chat) => {
          const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
          const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
          return bTime - aTime;
        });
        setConversations(sorted);
      }
    } catch (error: any) {
      console.error('Error fetching chats:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch chats');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChats(false);
  }, []);

  // Handle navigation centrally
  const handlePressChat = useCallback((item: Chat) => {
    const otherParticipant = item.participants.find(p => String(p._id) !== String(currentUserId));
    router.push({
      pathname: '/chat/detail',
      params: {
        chatId: item._id,
        otherUserId: otherParticipant?._id || '',
        otherUsername: otherParticipant?.username || ''
      }
    });
  }, [currentUserId, router]);

  const handlePressChatItem = useCallback((item: Chat) => handlePressChat(item), [handlePressChat]);

  // Render each chat item in the list
  const renderChat = useCallback(({ item }: { item: Chat }) => (
    <ChatItem 
      item={item} 
      onPress={() => handlePressChatItem(item)} 
      currentUserId={currentUserId} 
    />
  ), [currentUserId, handlePressChatItem]);

  // Render empty state
  const renderEmptyComponent = () => {
    if (loading) return null; // Let the main loader handle it
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🗨️</Text>
        <ThemedText type="subtitle" style={styles.emptyTextTitle}>No conversations yet</ThemedText>
        <Text style={styles.emptyTextSub}>Search for a user to start chatting!</Text>
      </View>
    );
  };

  if (loading && chats.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Chats</ThemedText>
      <FlatList
        data={chats}
        renderItem={renderChat}
        keyExtractor={(item) => String(item._id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={chats.length === 0 ? styles.emptyListContent : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF" // iOS spinner color
            colors={['#007AFF']} // Android spinner color
          />
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 4,
    backgroundColor: '#f5f5f5'
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16
  },
  avatar: { 
    width: 56, 
    height: 56, 
    borderRadius: 28,
    backgroundColor: '#f0f0f0'
  },
  unreadDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#007AFF',
    borderWidth: 3,
    borderColor: 'white'
  },
  username: {
    fontWeight: '700',
    fontSize: 17,
    flex: 1
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  title: { 
    margin: 16, 
    fontSize: 28, 
    fontWeight: 'bold',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  chatItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: 'white',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  chatInfo: { 
    flex: 1 
  },
  chatHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end',
    marginBottom: 4
  },
  timestamp: { 
    color: '#8e8e93', 
    fontSize: 13,
    marginLeft: 12
  },
  messageRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between' 
  },
  lastMessage: { 
    color: '#8e8e93', 
    fontSize: 15, 
    flex: 1 
  },
  ownMessagePreview: { 
    color: '#007AFF' 
  },
  unreadMessage: { 
    fontWeight: '600' 
  },
  rightSection: { 
    flexDirection: 'row', 
    alignItems: 'center',
    minWidth: 40
  },
  unreadBadge: { 
    backgroundColor: '#FF3B30', 
    borderRadius: 12, 
    minWidth: 24, 
    height: 24, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  unreadText: { 
    color: 'white', 
    fontSize: 12, 
    fontWeight: 'bold',
    textAlign: 'center'
  },
  readStatus: { 
    color: '#007AFF', 
    fontSize: 15, 
    marginLeft: 8 
  },
  emptyListContent: { flex: 1 },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 40 
  },
  emptyIcon: { 
    fontSize: 72, 
    marginBottom: 24 
  },
  emptyTextTitle: { 
    fontSize: 22, 
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center'
  },
  emptyTextSub: { 
    color: '#8e8e93', 
    fontSize: 17, 
    textAlign: 'center',
    lineHeight: 24 
  },
});

