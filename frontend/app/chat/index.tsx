import React, { useEffect, useState, useCallback, memo, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl, ActivityIndicator, Image, useColorScheme, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useTheme } from '@/hooks/use-theme-color';
import { preloadImage } from '@/services/imageCacheManager';

interface Chat {
  _id: string;
  convoType: 'direct' | 'group';
  participants: {
    user: {
      _id: string;
      username: string;
      profilePicture: string;
      name: string;
      isOnline: boolean;
      lastSeen: string;
      bio: string;
    };
    role: string;
    joinedAt: string;
    lastReadMsgId: string | null;
  }[];
  lastMessage?: {
    text: string;
    createdAt: string;
    sender: {
      _id: string;
      username: string;
      profilePicture: string;
    };
  };
  unreadCount: number;
  lastReadMsgId: string | null;
  lastActivityTimestamp: string;
  updatedAt: string;
  createdAt: string;
  otherUser?: {
    _id: string;
    username: string;
    profilePicture: string;
    name: string;
  };
}

// ✅ FIX (Bug #9): Improved timezone-aware relative time formatting
const formatRelativeTime = (dateString: string) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    // Validate date parsing
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // Calculate difference in milliseconds (both are in UTC)
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // Handle clock skew
    if (diffSec < 0) return 'now';
    
    // Format based on time difference
    if (diffSec < 60) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHour < 24) return `${diffHour}h`;
    if (diffDay < 7) return `${diffDay}d`;
    
    // For older messages, show date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error('[ChatIndex] Error formatting time:', error);
    return '';
  }
};

// Platform-specific FlatList configuration for Android optimization
const getFlatListConfig = () => {
  const isAndroid = Platform.OS === 'android';
  
  return {
    initialNumToRender: isAndroid ? 5 : 10,           // Lower for Android to reduce memory
    maxToRenderPerBatch: isAndroid ? 5 : 10,          // Lower for Android
    windowSize: isAndroid ? 3 : 5,                    // Smaller render window for Android
    updateCellsBatchingPeriod: isAndroid ? 50 : 100,  // Faster batching on Android
    scrollEventThrottle: isAndroid ? 16 : 1,          // Throttle scroll events on Android
  };
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
  const colors = useTheme();
  const otherParticipant = useMemo(() => 
    item.participants.find(p => String(p.user._id) !== String(currentUserId)),
    [item.participants, currentUserId]
  );
  
  const isFromMe = useMemo(() => 
    String(item.lastMessage?.sender?._id) === String(currentUserId),
    [item.lastMessage?.sender?._id, currentUserId]
  );

  // Memoized: Safely construct avatar URI with proper fallback for Android
  // ✅ FIX (Bug #7): Comprehensive null checks and validation
  const memoizedAvatarUri = useMemo(() => {
    const picture = otherParticipant?.user?.profilePicture;
    const username = otherParticipant?.user?.username;
    
    // Validate picture and ensure it's a proper HTTP(S) URL
    if (picture && 
        typeof picture === 'string' && 
        picture.trim().length > 0 &&
        picture.startsWith('http')) {
      
      // FIX: For Android, add Cloudinary optimization parameters
      if (Platform.OS === 'android' && picture.includes('cloudinary')) {
        // Ensure HTTPS and add caching/quality params
        const httpsUrl = picture.replace(/^https?:/, 'https:');
        // Add quality and width parameters for optimization
        const separator = httpsUrl.includes('?') ? '&' : '?';
        return `${httpsUrl}${separator}q=80&w=150&c=limit`;
      }
      
      return picture;
    }
    
    // ✅ FIX (Bug #7): Secure fallback with proper encoding and logging
    if (!picture || (typeof picture === 'string' && picture.trim().length === 0)) {
      console.debug('[Chat] Using fallback avatar - no profile picture provided', {
        picture,
        username,
        hasUsername: !!(username && username.trim().length > 0)
      });
    }
    
    const seed = username && username.trim().length > 0 ? encodeURIComponent(username) : 'unknown';
    return `https://i.pravatar.cc/150?u=${seed}&size=150`;
  }, [otherParticipant?.user?.profilePicture, otherParticipant?.user?.username]);

  // Memoized: Format last message text
  const memoizedLastMessage = useMemo(() => {
    if (!item.lastMessage?.text) return 'No messages yet';
    if (!isFromMe && item.lastMessage?.sender) {
      return `${item.lastMessage.sender.username || 'User'}: ${item.lastMessage.text}`;
    }
    return isFromMe ? `You: ${item.lastMessage.text}` : item.lastMessage.text;
  }, [item.lastMessage?.text, item.lastMessage?.sender, isFromMe]);

  // Memoized: Format relative timestamp
  // ✅ FIX (Bug #1): Use lastActivityTimestamp for sorting/display consistency
  // This ensures empty chats (without lastMessage) still show correct creation time
  const memoizedTimestamp = useMemo(() => 
    formatRelativeTime(item.lastActivityTimestamp || item.updatedAt),
    [item.lastActivityTimestamp, item.updatedAt]
  );
  
  // FIX: Preload avatar image on Android for caching
  useEffect(() => {
    if (memoizedAvatarUri) {
      preloadImage(memoizedAvatarUri);
    }
  }, [memoizedAvatarUri]);
  
  const formatLastMessagePreview = (text: string) => {
    if (text.length > 60) return text.slice(0, 60) + '…';
    return text;
  };

  return (
    <TouchableOpacity 
      style={[styles.chatItem, { backgroundColor: colors.card }]} 
      onPress={onPress} 
      activeOpacity={0.7}
      delayPressIn={Platform.OS === 'android' ? 100 : 0}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image 
          source={{ uri: memoizedAvatarUri }}
          style={styles.avatar}
          // ✅ FIX (Bug #7): Comprehensive error handling with detailed logging
          onError={(error: any) => {
            console.warn('[Chat] Avatar load failed:', { 
              uri: memoizedAvatarUri,
              username: otherParticipant?.user?.username,
              error: error?.error || error || 'Unknown error',
              platform: Platform.OS,
              hasPicture: !!otherParticipant?.user?.profilePicture
            });
            
            // FIX: Log Android-specific certificate/connection issues
            if (Platform.OS === 'android') {
              console.warn('[Chat Android] Image loading issue - verify:', {
                networkSecurityConfig: 'Check android/app/src/main/res/xml/network_security_config.xml',
                cloudinaryUrl: memoizedAvatarUri.includes('cloudinary'),
                httpUrl: memoizedAvatarUri.startsWith('http:'),
                recommendation: 'Ensure HTTPS URLs and proper domain whitelisting'
              });
            }
          }}
          // ✅ FIX (Bug #7): Add onLoadStart/onLoadEnd for better debugging
          onLoadStart={() => {
            // Could add loading indicator here if needed
          }}
          onLoad={() => {
            // Avatar loaded successfully - could track metrics
          }}
        />
        {item.unreadCount > 0 && <View style={styles.unreadDot} />}
      </View>
      
      {/* Info */}
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <ThemedText type="subtitle" style={styles.username} numberOfLines={1} ellipsizeMode="tail">
            {otherParticipant?.user?.username || 'Unknown User'}
          </ThemedText>
          <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
            {memoizedTimestamp}
          </Text>
        </View>
        <View style={styles.messageRow}>
          <Text style={[styles.lastMessage, { color: colors.textSecondary }, isFromMe && { color: colors.tint }, item.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
            {memoizedLastMessage}
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
}, (prevProps, nextProps) => {
  // Custom memo comparison for Android - only re-render if critical data changes
  return (
    prevProps.item._id === nextProps.item._id &&
    prevProps.item.unreadCount === nextProps.item.unreadCount &&
    prevProps.item.lastMessage?.createdAt === nextProps.item.lastMessage?.createdAt &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});

ChatItem.displayName = 'ChatItem';

export default function ChatListScreen() {
  const colors = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Get socket from global SocketContext
  const { conversations, setConversations, currentUserId, socket } = useSocket();
  const router = useRouter();
  // Cast conversations to Chat[] for type safety in this component
  const chats = conversations as Chat[];

  // Get platform-specific FlatList configuration
  const flatListConfig = useMemo(() => getFlatListConfig(), []);

  // The socket context handles real-time updates globally.
  // We only fetch chats once on initial mount if the list is empty.
  useEffect(() => {
    if (chats.length === 0) {
      fetchChats(true);
    }
  }, []);

  // MEDIUM FIX: Handle unread message updates from socket
  useEffect(() => {
    if (!socket) return;

    const handleUnreadUpdate = (data: { chatId: string; unreadCount: number }) => {
      // Sync unread count with API state
      setConversations((prev) =>
        prev.map((c) =>
          String(c._id) === String(data.chatId)
            ? { ...c, unreadCount: data.unreadCount }
            : c
        )
      );
    };

    socket.on('unread count updated', handleUnreadUpdate);
    return () => {
      socket.off('unread count updated', handleUnreadUpdate);
    };
  }, [socket, setConversations]);

  // Fetch all chats from server
  const fetchChats = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const data = await get('/chats');
      if (data && Array.isArray(data)) {
        // FIX: Deduplicate chats by ID before sorting
        const uniqueChats = Array.from(
          new Map(data.map((chat: Chat) => [chat._id, chat])).values()
        ) as Chat[];

        // Sort chats by most recent message (lastMessage.createdAt or lastActivityTimestamp)
        const sorted = uniqueChats.sort((a: Chat, b: Chat) => {
          const aTime = a.lastMessage?.createdAt 
            ? new Date(a.lastMessage.createdAt).getTime() 
            : new Date(a.lastActivityTimestamp || a.updatedAt).getTime();
          const bTime = b.lastMessage?.createdAt 
            ? new Date(b.lastMessage.createdAt).getTime() 
            : new Date(b.lastActivityTimestamp || b.updatedAt).getTime();
          return bTime - aTime;
        });
        setConversations(sorted as any); // Cast to any to handle SocketContext Conversation type
      }
    } catch (error: any) {
      console.error('Error fetching chats:', error);
      Alert.alert('Error', error.message || 'Failed to fetch chats');
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
    const otherParticipant = item.participants.find(p => String(p.user._id) !== String(currentUserId));
    router.push({
      pathname: '/chat/detail',
      params: {
        chatId: item._id,
        otherUserId: otherParticipant?.user?._id || '',
        otherUsername: otherParticipant?.user?.username || ''
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

  // Debug: Log data shape for Android crash investigation
  useEffect(() => {
    if (chats.length > 0) {
      console.log('🔍 [CHAT_LIST] Data shape check:');
      console.log('📦 Total chats:', chats.length);
      console.log('📄 First chat:', JSON.stringify(chats[0], null, 2));
      console.log('🖼️ First chat avatar:', chats[0]?.participants?.[0]?.user?.profilePicture);
      console.log('💬 First chat lastMessage:', chats[0]?.lastMessage);
      console.log('👤 Current user ID:', currentUserId);
      
      // Check for bad data patterns
      const badChats = chats.filter((chat, idx) => {
        const hasNullAvatar = !chat.participants?.[0]?.user?.profilePicture;
        const hasNullMessage = chat.lastMessage === null || chat.lastMessage === undefined;
        const hasMissingUser = !chat.participants?.[0]?.user?.username;
        if (hasNullAvatar || hasNullMessage || hasMissingUser) {
          console.warn(`⚠️ Chat ${idx} has bad data:`, { hasNullAvatar, hasNullMessage, hasMissingUser });
        }
        return hasNullAvatar || hasNullMessage || hasMissingUser;
      });
      if (badChats.length > 0) console.error('🔴 Found bad chats:', badChats.length);
    }
  }, [chats, currentUserId]);

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
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Chats</ThemedText>
      <FlatList
        data={Array.isArray(chats) ? chats : []}
        renderItem={renderChat}
        keyExtractor={(item) => String(item._id)}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={chats.length === 0 ? styles.emptyListContent : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
            colors={[colors.tint]}
          />
        }
        {...flatListConfig}
        removeClippedSubviews={true}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16
  },
  avatar: { 
    width: 56, 
    height: 56, 
    borderRadius: 28,
  },
  unreadDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0a7ea4', // Theme: light.info / primary tint
    borderWidth: 3,
    borderColor: '#ffffff' // Theme: white border
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
  },
  chatItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 16,
    shadowColor: 'rgba(0,0,0,0.3)',
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
    fontSize: 13,
    marginLeft: 12
  },
  messageRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between' 
  },
  lastMessage: { 
    fontSize: 15, 
    flex: 1 
  },
  ownMessagePreview: { },
  unreadMessage: { 
    fontWeight: '600' 
  },
  rightSection: { 
    flexDirection: 'row', 
    alignItems: 'center',
    minWidth: 40
  },
  unreadBadge: { 
    backgroundColor: '#d32f2f', // Theme: light.error / error badge
    borderRadius: 12, 
    minWidth: 24, 
    height: 24, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  unreadText: { 
    color: '#f8f9fa', // Theme: light.background 
    fontSize: 12, 
    fontWeight: 'bold',
    textAlign: 'center'
  },
  readStatus: { 
    fontSize: 15, 
    marginLeft: 8,
    color: '#0a7ea4', // Theme: light.info / primary tint
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
    fontSize: 17, 
    textAlign: 'center',
    lineHeight: 24 
  },
});

