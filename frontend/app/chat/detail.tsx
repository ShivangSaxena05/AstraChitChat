import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { SOCKET_URL } from '@/services/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

interface Message {
  _id: string;
  sender: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  receiver: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  msgType: string;
  bodyText?: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaSizeBytes?: number;
  quotedMsgId?: string;
  editedAt?: string;
  unsentAt?: string;
  unsentBy?: string;
  content?: string;
  createdAt: string;
  readBy: string[];
}

// Type for items in the flatlist (messages or date separators)
type ListItem = 
  | { type: 'message'; data: Message }
  | { type: 'dateSeparator'; date: string; dateKey: string };

export default function ChatDetailScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupedMessages, setGroupedMessages] = useState<ListItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [otherUserStatus, setOtherUserStatus] = useState<{ isOnline: boolean; lastSeen: string | null }>({ isOnline: false, lastSeen: null });
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;

  // Helper to format date for separator
  const formatDateSeparator = (dateString: string): { display: string; key: string } => {
    const messageDate = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = messageDate.toDateString() === today.toDateString();
    const isYesterday = messageDate.toDateString() === yesterday.toDateString();

    if (isToday) {
      return { display: 'Today', key: 'today' };
    } else if (isYesterday) {
      return { display: 'Yesterday', key: 'yesterday' };
    } else {
      return { display: messageDate.toLocaleDateString(), key: messageDate.toDateString() };
    }
  };

  // Group messages by date and add separators
  const groupMessagesByDate = useCallback((msgs: Message[]): ListItem[] => {
    const result: ListItem[] = [];
    let currentDateKey = '';

    msgs.forEach((message) => {
      const { display, key } = formatDateSeparator(message.createdAt);
      
      if (key !== currentDateKey) {
        result.push({ type: 'dateSeparator', date: display, dateKey: key });
        currentDateKey = key;
      }
      result.push({ type: 'message', data: message });
    });

    return result;
  }, []);

  // Fetch user online status
  const fetchUserStatus = async () => {
    if (!otherUserId) return;
    try {
      const data = await get(`/chats/user-status/${otherUserId}`);
      setOtherUserStatus({
        isOnline: data.isOnline || false,
        lastSeen: data.lastSeen || null
      });
    } catch (error) {
      console.log('Error fetching user status:', error);
    }
  };

  // Format last seen display
  const formatLastSeen = (lastSeen: string | null): string => {
    if (!lastSeen) return 'Last seen unknown';
    
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return 'Last seen just now';
    if (diffMin < 60) return `Last seen ${diffMin}m ago`;
    if (diffHour < 24) return `Last seen ${diffHour}h ago`;
    if (diffDay < 7) return `Last seen ${diffDay}d ago`;
    
    return `Last seen ${date.toLocaleDateString()}`;
  };

  useEffect(() => {
    const initialize = async () => {
      setMessages([]);
      setLoading(true);
      setGroupedMessages([]);

      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);

      const token = await AsyncStorage.getItem('token');
      const newSocket = io(SOCKET_URL, {
        auth: { token }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Connected to socket');
        setSocketConnected(true);
        newSocket.emit('setup', { _id: userId });
        newSocket.emit('join chat', chatId);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from socket');
        setSocketConnected(false);
      });

      newSocket.on('message received', (message: Message) => {
        setMessages(prev => {
          const exists = prev.some(m => m._id === message._id);
          if (exists) return prev;
          const updated = [...prev, message];
          return updated;
        });
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });

      // Listen for online status changes
      newSocket.on('user online', (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
        if (data.userId === otherUserId) {
          setOtherUserStatus({
            isOnline: data.isOnline,
            lastSeen: data.lastSeen || (data.isOnline ? null : new Date().toISOString())
          });
        }
      });

      fetchMessages();
      fetchUserStatus();
    };

    initialize();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('message received');
        socketRef.current.off('user online');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [chatId, otherUserId]);

  // Update grouped messages when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setGroupedMessages(groupMessagesByDate(messages));
    }
  }, [messages, groupMessagesByDate]);

  // Refresh user status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!otherUserStatus.isOnline) {
        fetchUserStatus();
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [otherUserStatus.isOnline]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const data = await get(`/chats/${chatId}/messages`);
      setMessages(data.messages);
      setGroupedMessages(groupMessagesByDate(data.messages));
      
      if (chatId && currentUserId) {
        markAllAsRead();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await post('/chats/read-all', { chatId });
    } catch (error) {
      console.log('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !socketRef.current || !socketConnected) return;

    try {
      const messageData = {
        sender: currentUserId,
        receiver: otherUserId,
        chat: chatId,
        bodyText: newMessage.trim(),
        content: newMessage.trim(),
        msgType: 'text'
      };

      socketRef.current.emit('new message', messageData);
      setNewMessage('');

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to send message');
    }
  };

  const isMessageRead = (message: Message) => {
    if (message.sender._id === currentUserId) {
      return message.readBy?.includes(otherUserId);
    }
    return false;
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'dateSeparator') {
      return (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{item.date}</Text>
        </View>
      );
    }

    const message = item.data;
    const isOwnMessage = message.sender._id === currentUserId;
    const isRead = isMessageRead(message);

    return (
      <View style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
        <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
          {message.unsentAt ? '[Message unsent]' : (message.bodyText || message.content)}
        </Text>
        {message.editedAt && !message.unsentAt && (
          <Text style={[styles.editedText, isOwnMessage ? styles.ownEditedText : styles.otherEditedText]}>
            (edited)
          </Text>
        )}
        <View style={styles.timestampContainer}>
          <Text style={[styles.timestamp, isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp]}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isOwnMessage && (
            <Text style={[styles.readStatus, isRead ? styles.readStatusBlue : styles.readStatusGray]}>
              {isRead ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButtonContainer}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <ThemedText type="subtitle">{otherUsername}</ThemedText>
          <Text style={[
            styles.statusText,
            otherUserStatus.isOnline ? styles.onlineStatus : styles.offlineStatus
          ]}>
            {otherUserStatus.isOnline ? 'Online' : formatLastSeen(otherUserStatus.lastSeen)}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.type === 'dateSeparator' ? `sep-${item.dateKey}` : `msg-${item.data._id}`}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          blurOnSubmit
        />
        <TouchableOpacity
          style={[styles.sendButton, (!socketConnected || !newMessage.trim()) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!socketConnected || !newMessage.trim()}
        >
          <Text style={[styles.sendButtonText, (!socketConnected || !newMessage.trim()) && styles.sendButtonTextDisabled]}>
            {socketConnected ? 'Send' : 'Connecting...'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  backButtonContainer: {
    marginRight: 12,
  },
  backButton: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 12,
    marginTop: 2,
  },
  onlineStatus: {
    color: '#34C759',
  },
  offlineStatus: {
    color: '#8E8E93',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    backgroundColor: '#333',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: 'hidden',
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#333',
  },
  messageText: {
    fontSize: 16,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 4,
  },
  ownTimestamp: {
    color: '#e0e0e0',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: '#aaa',
  },
  timestampContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readStatus: {
    fontSize: 12,
    marginLeft: 8,
  },
  readStatusBlue: {
    color: '#34B7F1',
  },
  readStatusGray: {
    color: '#e0e0e0',
  },
  editedText: {
    fontSize: 12,
    marginTop: 2,
  },
  ownEditedText: {
    color: '#e0e0e0',
  },
  otherEditedText: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    maxHeight: 100,
    color: '#fff',
    backgroundColor: '#2a2a2a',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#444',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  sendButtonTextDisabled: {
    color: '#888',
  },
});

