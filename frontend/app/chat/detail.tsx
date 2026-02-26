import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  chat?: string | { _id: string };
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

// Memoized message item to prevent re-rendering all messages when user types
const MessageItem = memo(({ 
  item, 
  currentUserId,
  isMessageRead
}: { 
  item: ListItem; 
  currentUserId: string | null;
  isMessageRead: (message: Message, currentId: string | null) => boolean;
}) => {
  if (item.type === 'dateSeparator') {
    return (
      <View style={styles.dateSeparator}>
        <Text style={styles.dateSeparatorText}>{item.date}</Text>
      </View>
    );
  }

  const message = item.data;
  const isOwnMessage = String(message.sender._id) === String(currentUserId);
  const isRead = isMessageRead(message, currentUserId);

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
});

export default function ChatDetailScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupedMessages, setGroupedMessages] = useState<ListItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserStatus, setOtherUserStatus] = useState<{ isOnline: boolean; lastSeen: string | null }>({ isOnline: false, lastSeen: null });
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;
  
  // Use shared socket and conversations from context
  const { socket, isConnected: socketConnected, setConversations, updateConversation, setActiveChatId } = useSocket();

  // Use a Set to track message IDs for O(1) deduplication
  const messageIdsRef = useRef<Set<string>>(new Set());

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

  // Initialize and set up socket listeners
  useEffect(() => {
    const init = async () => {
      // Clear previous message IDs when entering a new chat ONLY if we're actually clearing messages
      messageIdsRef.current.clear();
      setMessages([]);
      // Do not set loading to true here to avoid the aggressive spinner blocking the UI mount
      setGroupedMessages([]);

      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);

      fetchMessages();
      fetchUserStatus();

      // Instantly clear the unread count for this active chat in the global list
      setConversations(prev => prev.map(c => 
        String(c._id) === String(chatId) ? { ...c, unreadCount: 0 } : c
      ));
      
      setActiveChatId(chatId);
    };

    init();
    
    return () => {
      setActiveChatId(null);
    };
  }, [chatId, otherUserId, setActiveChatId]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !chatId) return;

    // Join the chat room
    socket.emit('join chat', chatId);

    // ========================================================================
    // FIX: Proper message deduplication using Set for O(1) lookup
    // ========================================================================
    const handleMessageReceived = (message: Message) => {
      // Get the chat ID from the message (handle both string and object)
      const messageChatId = typeof message.chat === 'object' ? message.chat?._id : message.chat;
      
      // Only handle messages for this chat
      if (String(messageChatId) === String(chatId)) {
        // FIX: Use Set for O(1) deduplication instead of array.some()
        const messageId = message._id;
        
        if (messageIdsRef.current.has(messageId)) {
          console.log('Chat detail: Duplicate message ignored:', messageId);
          return;
        }
        
        // Add to set and update state
        messageIdsRef.current.add(messageId);
        
        setMessages(prev => {
          // Double-check deduplication
          if (prev.some(m => m._id === messageId)) {
            return prev;
          }
          const updated = [...prev, message];
          return updated;
        });

        // Auto-mark as read if the message is from the other user
        if (message.sender._id !== currentUserId) {
          markAllAsRead();
          // Instantly clear the unread count in the global context so the list doesn't show a ghost badge
          setConversations(prev => prev.map(c => 
            String(c._id) === String(chatId) ? { ...c, unreadCount: 0 } : c
          ));
        }
      }
    };

    // Listen for online status changes
    const handleUserOnline = (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (data.userId === otherUserId) {
        setOtherUserStatus({
          isOnline: data.isOnline,
          lastSeen: data.lastSeen || (data.isOnline ? null : new Date().toISOString())
        });
      }
    };

    // Listen for typing indicators
    const handleRemoteTyping = () => setOtherUserTyping(true);
    const handleRemoteStopTyping = () => setOtherUserTyping(false);

    // Listen for real-time read receipts (Blue Ticks)
    const handleMessagesRead = () => {
      setMessages(prev => prev.map(m => {
        // If it's a message we sent, and it hasn't been marked read by the other user locally yet
        if (String(m.sender._id) === String(currentUserId) && !m.readBy?.includes(otherUserId)) {
          return { ...m, readBy: [...(m.readBy || []), otherUserId] };
        }
        return m;
      }));
    };

    socket.on('message received', handleMessageReceived);
    socket.on('user online', handleUserOnline);
    socket.on('typing', handleRemoteTyping);
    socket.on('stop typing', handleRemoteStopTyping);
    socket.on('messages read', handleMessagesRead);

    return () => {
      socket.off('message received', handleMessageReceived);
      socket.off('user online', handleUserOnline);
      socket.off('typing', handleRemoteTyping);
      socket.off('stop typing', handleRemoteStopTyping);
      socket.off('messages read', handleMessagesRead);
    };
  }, [socket, chatId, otherUserId, currentUserId]);

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
      if (messages.length === 0) setLoading(true); // Only show spinner if we have absolutely nothing
      const data = await get(`/chats/${chatId}/messages`);
      
      // Initialize message IDs set with existing messages for deduplication
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach((msg: Message) => {
          messageIdsRef.current.add(msg._id);
        });
      }
      
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
      if (socket && socketConnected) {
        socket.emit('read messages', chatId);
      }
    } catch (error) {
      console.log('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !socket || !socketConnected) return;

    try {
      const messageData = {
        sender: currentUserId,
        receiver: otherUserId,
        chat: chatId,
        bodyText: newMessage.trim(),
        content: newMessage.trim(),
        msgType: 'text'
      };

      socket.emit('new message', messageData);
      
      // Update global context immediately so ChatList re-sorts with the new message
      updateConversation({
        conversationId: chatId,
        lastMessage: {
          text: newMessage.trim(),
          createdAt: new Date().toISOString(),
          sender: {
            _id: currentUserId,
            username: 'You', // This gets formatted by ChatList's isFromMe logic anyway
            profilePicture: ''
          }
        },
        updatedAt: new Date().toISOString(),
        senderId: currentUserId,
        isNewMessage: true
      });

      setNewMessage('');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit('stop typing', chatId);
      // Inverted FlatList handles scrolling automatically
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to send message');
    }
  };

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!socketConnected || !socket) return;
    
    socket.emit('typing', chatId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop typing', chatId);
    }, 2000);
  };

  const isMessageRead = useCallback((message: Message, currentId: string | null) => {
    if (String(message.sender._id) === String(currentId)) {
      return message.readBy?.includes(otherUserId);
    }
    return false;
  }, [otherUserId]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => (
    <MessageItem 
      item={item} 
      currentUserId={currentUserId} 
      isMessageRead={isMessageRead} 
    />
  ), [currentUserId, isMessageRead]);

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
            (otherUserTyping || otherUserStatus.isOnline) ? styles.onlineStatus : styles.offlineStatus
          ]}>
            {otherUserTyping ? 'typing...' : (otherUserStatus.isOnline ? 'Online' : formatLastSeen(otherUserStatus.lastSeen))}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={[...groupedMessages].reverse()}
        inverted
        renderItem={renderItem}
        keyExtractor={(item, index) => item.type === 'dateSeparator' ? `sep-${item.dateKey}` : `msg-${item.data._id}`}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={handleTyping}
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
    paddingTop: 8,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSeparatorText: {
    backgroundColor: '#2b2b2b',
    color: '#aaa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 12,
    overflow: 'hidden',
  },
  messageContainer: {
    maxWidth: '85%',
    marginBottom: 8,
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 1, // subtle shadow for Android
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#005c4b', // WhatsApp Dark Mode Green
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#202c33', // WhatsApp Dark Mode Gray
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#e9edef',
  },
  otherMessageText: {
    color: '#e9edef',
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
    padding: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#202c33',
    backgroundColor: '#1f2c34', // WhatsApp dark mode input bg
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginRight: 8,
    maxHeight: 120,
    color: '#e9edef',
    backgroundColor: '#2a3942', // WhatsApp dark mode input field inside
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#00a884', // WhatsApp dark mode teal
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#3b4a54',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sendButtonTextDisabled: {
    color: '#8b9a9f',
  },
});

