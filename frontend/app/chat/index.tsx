import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import { SOCKET_URL } from '@/services/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

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

export default function ChatListScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);
      
      const token = await AsyncStorage.getItem('token');
      const newSocket = io(SOCKET_URL, { auth: { token } });

      newSocket.on('connect', () => {
        console.log('Chat list: Connected');
        newSocket.emit('setup', { _id: userId });
      });

      newSocket.on('disconnect', () => {
        console.log('Chat list: Disconnected');
      });

      setSocket(newSocket);
    };

    init();
  }, []);

  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const data = await get('/chats');
      if (data && data.chats) {
        const sorted = data.chats.sort((a: Chat, b: Chat) => {
          const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
          const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
          return bTime - aTime;
        });
        setChats(sorted);
      }
    } catch (error: any) {
      console.error('Error fetching chats:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch chats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!socket || !currentUserId) return;

    const handleConversationUpdated = (data: any) => {
      console.log('Chat list: Received conversation update via socket:', data);
      setChats(prevChats => {
        const existingIndex = prevChats.findIndex(c => c._id === data.conversationId);
        
        if (existingIndex >= 0) {
          const updatedChats = [...prevChats];
          updatedChats[existingIndex] = {
            ...updatedChats[existingIndex],
            lastMessage: data.lastMessage,
            updatedAt: data.updatedAt
          };
          
          updatedChats.sort((a, b) => {
            const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
            const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
            return bTime - aTime;
          });
          
          return updatedChats;
        } else {
          fetchChats();
          return prevChats;
        }
      });
    };

    socket.on('conversationUpdated', handleConversationUpdated);

    return () => {
      socket.off('conversationUpdated', handleConversationUpdated);
    };
  }, [socket, currentUserId]);

  const getOtherParticipant = (chat: Chat) => {
    return chat.participants.find(p => p._id !== currentUserId);
  };

  const isLastMessageFromMe = (chat: Chat) => {
    return chat.lastMessage?.sender?._id === currentUserId;
  };

  const formatLastMessage = (chat: Chat) => {
    if (!chat.lastMessage?.text) return 'No messages yet';
    const isFromMe = isLastMessageFromMe(chat);
    if (!isFromMe && chat.lastMessage?.sender) {
      return `${chat.lastMessage.sender.username || 'User'}: ${chat.lastMessage.text}`;
    }
    return isFromMe ? `You: ${chat.lastMessage.text}` : chat.lastMessage.text;
  };

  const renderChat = ({ item }: { item: Chat }) => {
    const otherParticipant = getOtherParticipant(item);
    const isFromMe = isLastMessageFromMe(item);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push({
          pathname: '/chat/detail',
          params: {
            chatId: item._id,
            otherUserId: otherParticipant?._id || '',
            otherUsername: otherParticipant?.username || ''
          }
        })}
      >
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <ThemedText type="subtitle">{otherParticipant?.username || 'Unknown'}</ThemedText>
            {item.lastMessage?.createdAt && (
              <Text style={styles.timestamp}>{formatRelativeTime(item.lastMessage.createdAt)}</Text>
            )}
          </View>
          <View style={styles.messageRow}>
            <Text style={[styles.lastMessage, isFromMe && styles.ownMessagePreview, item.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
              {formatLastMessage(item)}
            </Text>
            <View style={styles.rightSection}>
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                </View>
              )}
              {isFromMe && item.lastMessage?.createdAt && <Text style={styles.readStatus}>✓✓</Text>}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && chats.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <Text>Loading chats...</Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Chats</ThemedText>
      <FlatList
        data={chats}
        renderItem={renderChat}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { marginBottom: 16 },
  chatItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  timestamp: { color: '#888', fontSize: 12 },
  messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { color: '#666', fontSize: 14, flex: 1, marginRight: 8 },
  ownMessagePreview: { color: '#888' },
  unreadMessage: { fontWeight: 'bold', color: '#000' },
  rightSection: { flexDirection: 'row', alignItems: 'center' },
  unreadBadge: { backgroundColor: '#007AFF', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  readStatus: { color: '#007AFF', fontSize: 14, marginLeft: 8 },
});

