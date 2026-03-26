import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, StyleSheet,Image, FlatList, View, Text, StatusBar, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useCall } from '@/contexts/CallContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SwipeableMessage from '@/components/SwipeableMessage';

type MessageStatus = 'sending' | 'sent' | 'failed';

interface Message {
  _id: string;
  status?: MessageStatus;
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
  chat?: string | { _id: string; convoType?: 'direct' | 'group' };
  msgType: string;
  bodyText?: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaSizeBytes?: number;
  quotedMsgId?: string;
  quotedMessage?: {
    _id: string;
    bodyText: string;
    msgType?: string;
    sender: {
      _id: string;
      username: string;
    };
  };
  editedAt?: string;
  unsentAt?: string;
  unsentBy?: string;
  content?: string;
  createdAt: string;
  readBy: string[];
  deliveredTo?: string[];
}

interface OtherUserStatus {
  isOnline: boolean;
  lastSeen: string | null;
}


// Type for items in the flatlist (messages or date separators)
type ListItem = 
  | { type: 'message'; data: Message }
  | { type: 'dateSeparator'; date: string; dateKey: string };

// Memoized message item to prevent re-rendering all messages when user types
const MessageItem = memo(({ 
  item, 
  currentUserId,
  isMessageRead,
  onLongPress,
  onSwipeReply,
  onReplyPress,
  highlightedMessageId
}: { 
  item: ListItem; 
  currentUserId: string | null;
  isMessageRead: (message: Message, currentId: string | null) => boolean;
  onLongPress?: (message: Message) => void;
  onSwipeReply?: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  highlightedMessageId?: string | null;
}) => {
  // Handle swipe to reply - must be called unconditionally
  const handleSwipe = useCallback(() => {
    if (item.type === 'message') {
      onSwipeReply?.(item.data);
    }
  }, [item, onSwipeReply]);

  if (item.type === 'dateSeparator') {
    return (
      <View style={styles.dateSeparator}>
        <Text style={styles.dateSeparatorText}>{item.date}</Text>
      </View>
    );
  }

  const message = item.data;
  const isOwnMessage = String(message.sender._id) === String(currentUserId);
  const messageStatus = message.status;
  const isRead = isMessageRead(message, currentUserId);
  const isDelivered = message.deliveredTo &&
                      currentUserId &&
                      message.deliveredTo.some(id => String(id) !== String(currentUserId));

  const isGroupChat = typeof message.chat === 'object' ? message.chat?.convoType === 'group' : false;
  const isHighlighted = highlightedMessageId === message._id;

  return (
    <SwipeableMessage
      onSwipeReply={handleSwipe}
      isOwnMessage={isOwnMessage}
    >
      <TouchableOpacity 
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <View style={[
          styles.messageContainer, 
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
          isHighlighted && styles.highlightedMessage
        ]}>
          {/* Quoted Message Display */}
          {(message.quotedMessage || message.quotedMsgId) && (
            <TouchableOpacity 
              style={[styles.quotedMessageContainer, isOwnMessage ? styles.ownQuotedMessage : styles.otherQuotedMessage]}
              onPress={() => message.quotedMessage && onReplyPress?.(message.quotedMessage._id)}
              activeOpacity={0.8}
              disabled={!message.quotedMessage}
            >
              <Text style={[styles.quotedMessageName, isOwnMessage ? styles.ownQuotedName : styles.otherQuotedName]}>
                {message.quotedMessage?.sender?.username || 'Unknown'}
              </Text>
              <Text style={[styles.quotedMessageText, isOwnMessage ? styles.ownQuotedText : styles.otherQuotedText]} numberOfLines={1}>
                {message.quotedMessage 
                  ? (message.quotedMessage.msgType === 'image' ? '📷 Photo' : (message.quotedMessage.msgType === 'video' ? '🎥 Video' : (message.quotedMessage.bodyText || 'Message')))
                  : 'Original message unavailable'}
              </Text>
            </TouchableOpacity>
          )}
          
          {!isOwnMessage && message.sender?.username && (
            <Text style={styles.senderNameText}>{message.sender.username}</Text>
          )}
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
{isOwnMessage && message.status ? (
              <View style={styles.statusContainer}>
                {message.status === 'sending' ? (
                  <ActivityIndicator size="small" color="#e9edef" />
                ) : message.status === 'sent' ? (
                  <Text style={[styles.statusIcon, styles.sentIcon]}>✓✓</Text>
                ) : (
                  <TouchableOpacity 
                    style={styles.retryButton}
                    onPress={() => {
                      const attempts = retryAttempts.current.get(message._id) || 0;
                      if (attempts >= 3) {
                        Alert.alert('Max retries reached', 'Please check your connection');
                        return;
                      }
                      retryAttempts.current.set(message._id, attempts + 1);
                      console.log('Retry message:', message._id, 'Attempt:', attempts + 1);
                      // TODO: Implement API retry call
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.retryIcon}>↻</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : isOwnMessage && (
              <Text style={[
                styles.readStatus, 
                isRead ? styles.readStatusBlue : styles.readStatusGray
              ]}>
                {isRead ? '✓✓' : (isDelivered ? '✓✓' : '✓')}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </SwipeableMessage>
  );
});

MessageItem.displayName = 'MessageItem';

export default function ChatDetailScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupedMessages, setGroupedMessages] = useState<ListItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const errorOpacity = useSharedValue(0);
  const errorTranslateY = useSharedValue(100);

  // Snackbar animation
  useEffect(() => {
    if (showError && error) {
      errorOpacity.value = withSpring(1);
      errorTranslateY.value = withSpring(0);
      const timer = setTimeout(() => {
        errorTranslateY.value = withSpring(100, {}, () => {
          errorOpacity.value = 0;
          setShowError(false);
          setError(null);
        });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [showError, error]);
  const [hasMore, setHasMore] = useState(true);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUserStatus, setOtherUserStatus] = useState<any>({ profilePicture: '', isOnline: false, lastSeen: null });
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserProfilePicture, setOtherUserProfilePicture] = useState('');

  
  // Call Gesture State (Reanimated)
  const [isHoldingTop, setIsHoldingTop] = useState(false);
  const [callProgress, setCallProgress] = useState(0);
  
  const isAtBottom = useSharedValue(true);
  const pullDistance = useSharedValue(0);

  // Reply/Quote feature state
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempTimeouts = useRef<NodeJS.Timeout[]>([]);
  const retryAttempts = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    return () => {
      tempTimeouts.current.forEach(id => clearTimeout(id));
      tempTimeouts.current = [];
    };
  }, []);
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList<any>>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;
  
  // Use shared socket and conversations from context
  const { socket, isConnected: socketConnected, setConversations, updateConversation, setActiveChatId } = useSocket();

  // Call Context connection
  const { initiateCall } = useCall();

  // Use refs to avoid dependency issues in socket listeners
  const currentUserIdRef = useRef<string | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  
  // Update refs when values change
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);
  
  useEffect(() => {
    otherUserIdRef.current = otherUserId;
  }, [otherUserId]);
  
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Use a Set to track message IDs for O(1) deduplication
  const messageIdsRef = useRef<Set<string>>(new Set());
  
  // Prevent memory leak - cleanup old IDs
  useEffect(() => {
    const interval = setInterval(() => {
      if (messageIdsRef.current.size > 1000) {
        messageIdsRef.current.clear();
        console.log('Chat: Cleared messageIdsRef (memory protection)');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
      setOtherUserProfilePicture(data.profilePicture);
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
      messageIdsRef.current.clear();
      setMessages([]);
      setGroupedMessages([]);
      setHasMore(true);
      setOldestMessageId(null);

      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);

      fetchMessages();
      fetchUserStatus();

      setConversations(prev => prev.map(c => 
        String(c._id) === String(chatId) ? { ...c, unreadCount: 0 } : c
      ));
      
      setActiveChatId(chatId);
    };

    init();
    
    return () => {
      // Clear typing timeout on unmount to prevent memory leaks
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setActiveChatId(null);
    };
  }, [chatId, otherUserId, setActiveChatId]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !chatId) return;

    socket.emit('join chat', chatId);

    const handleMessageReceived = (message: Message) => {
      const messageChatId = typeof message.chat === 'object' ? message.chat?._id : message.chat;
      
      if (String(messageChatId) === String(chatId)) {
        const messageId = message._id;

        // If this message is from the current user, it's the confirmation of an optimistic message.
        // Find and remove the oldest temporary message, assuming messages are processed in order.
        if (String(message.sender._id) === String(currentUserIdRef.current)) {
          setMessages(prev => {
            const tempMsgIndex = prev.findIndex(
              m => m._id.startsWith('temp_') && m.bodyText === message.bodyText
            );
            if (tempMsgIndex > -1) {
              return prev.filter((_, index) => index !== tempMsgIndex);
            }
            return prev;
          });
        }
        


        
        // ✅ FIXED: Robust duplicate prevention + validation
        if (typeof messageId !== 'string' || messageIdsRef.current.has(messageId)) {
          // console.log('Chat detail: Duplicate/invalid message ignored:', messageId);
          return;
        }

        // Sanitize incoming quotedMessage bodyText (XSS prevention)
        let finalMessage: Message = { ...message };
        if (message.quotedMessage) {
          finalMessage.quotedMessage = {
            ...message.quotedMessage,
            bodyText: sanitizeMessage(message.quotedMessage.bodyText || '')
          };
        }
        
        messageIdsRef.current.add(messageId);
        
        // Immutable update w/ explicit dedup check
        setMessages(prev => {
          if (prev.some(m => m._id === messageId)) {
            // console.log('State dedup: Message already exists:', messageId);
            return prev;
          }

          // Hydrate quoted message from local state if missing in incoming message
          let msgToStore = { ...finalMessage };
          if (msgToStore.quotedMsgId && !msgToStore.quotedMessage) {
            const found = prev.find(m => m._id === msgToStore.quotedMsgId);
            if (found) {
              msgToStore.quotedMessage = {
                _id: found._id,
                bodyText: sanitizeMessage(found.bodyText || found.content || ''),
                sender: found.sender,
                msgType: found.msgType
              };
            }
          }

          return [...prev, msgToStore].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });

        if (message.sender._id !== currentUserId) {
          markAllAsRead();
          setConversations(prev => prev.map(c => 
            String(c._id) === String(chatId) ? { ...c, unreadCount: 0 } : c
          ));
        }
      } else {
        if (message.sender._id !== currentUserId) {
            socket.emit('message delivered', {
                messageId: message._id,
                chatId: messageChatId,
                senderId: message.sender._id,
                receiverId: currentUserId
            });
        }
      }
    };

    const handleUserOnline = (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (data.userId === otherUserId) {
        setOtherUserStatus({
          isOnline: data.isOnline,
          lastSeen: data.lastSeen || (data.isOnline ? null : new Date().toISOString())
        });
      }
    };

    const handleRemoteTyping = () => setOtherUserTyping(true);
    const handleRemoteStopTyping = () => setOtherUserTyping(false);

    const handleMessagesRead = (data?: { chatId?: string; readerId?: string }) => {
      const currentOtherUserId = otherUserIdRef.current;
      const currentUser = currentUserIdRef.current;
      
      if (data?.readerId && String(data.readerId) !== String(currentUser)) {
        return;
      }
      
      setMessages(prev => prev.map(m => {
        if (String(m.sender._id) === String(currentUser) && 
            currentOtherUserId &&
            !m.readBy?.includes(currentOtherUserId)) {
          return { ...m, readBy: [...(m.readBy || []), currentOtherUserId] };
        }
        return m;
      }));
    };

    const handleMessageDelivered = (data?: { messageId?: string, receiverId?: string }) => {
        if (!data || !data.messageId || !data.receiverId) return;
        
        setMessages(prev => prev.map(m => {
            if (String(m._id) === String(data.messageId)) {
                if (!m.deliveredTo?.includes(String(data.receiverId))) {
                    return {
                        ...m,
                        deliveredTo: [...(m.deliveredTo || []), String(data.receiverId)]
                    };
                }
            }
            return m;
        }));
    };

    socket.on('message received', handleMessageReceived);
    socket.on('user online', handleUserOnline);
    socket.on('typing', handleRemoteTyping);
    socket.on('stop typing', handleRemoteStopTyping);
    socket.on('messages read', handleMessagesRead);
    socket.on('message delivered', handleMessageDelivered);

    return () => {
      socket.off('message received', handleMessageReceived);
      socket.off('user online', handleUserOnline);
      socket.off('typing', handleRemoteTyping);
      socket.off('stop typing', handleRemoteStopTyping);
      socket.off('messages read', handleMessagesRead);
      socket.off('message delivered', handleMessageDelivered);
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
    }, 30000);

    return () => clearInterval(interval);
  }, [otherUserStatus.isOnline]);

  const fetchMessages = async (isLoadMore = false) => {
    try {
      if (!isLoadMore) {
        if (messages.length === 0) setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      let queryParams = `limit=30`;
      if (isLoadMore && oldestMessageId) {
        queryParams += `&beforeMessageId=${oldestMessageId}`;
      }
      
      const data = await get(`/chats/${chatId}/messages?${queryParams}`);
      
      const processedMessages = (data.messages || []);
      
      if (processedMessages.length > 0) {
        processedMessages.forEach((msg: Message) => {
          messageIdsRef.current.add(msg._id);
        });
      }
      
      if (isLoadMore) {
        setMessages(prevMessages => {
          // Hydrate messages using both new batch and existing messages
          const allMessagesMap = new Map<string, Message>([...processedMessages, ...prevMessages].map(m => [m._id, m]));
          
          const hydratedNewMessages = processedMessages.map((msg: Message) => {
            if (msg.quotedMsgId && !msg.quotedMessage) {
              const found = allMessagesMap.get(msg.quotedMsgId);
              if (found) {
                return {
                  ...msg,
                  quotedMessage: {
                    _id: found._id,
                    bodyText: sanitizeMessage(found.bodyText || found.content || ''),
                    sender: found.sender,
                    msgType: found.msgType
                  }
                };
              }
            }
            return msg;
          });

          const updatedMessages = [...hydratedNewMessages, ...prevMessages];
          setGroupedMessages(groupMessagesByDate(updatedMessages));
          return updatedMessages;
        });
      } else {
        // Initial load hydration
        const msgMap = new Map<string, Message>(processedMessages.map((m: Message) => [m._id, m]));
        const hydratedMessages = processedMessages.map((msg: Message) => {
          if (msg.quotedMsgId && !msg.quotedMessage) {
            const found = msgMap.get(msg.quotedMsgId);
            if (found) {
              return {
                ...msg,
                quotedMessage: {
                  _id: found._id,
                  bodyText: sanitizeMessage(found.bodyText || found.content || ''),
                  sender: found.sender,
                  msgType: found.msgType
                }
              };
            }
          }
          return msg;
        });

        setMessages(hydratedMessages);
        setGroupedMessages(groupMessagesByDate(hydratedMessages));
      }
      
      setHasMore(data.hasMore !== false);
      setOldestMessageId(data.oldestMessageId || null);
      
      if (!isLoadMore && chatId && currentUserId) {
        markAllAsRead();
        
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach((msg: Message) => {
                if (String(msg.sender._id) !== String(currentUserId) && 
                    (!msg.deliveredTo || !msg.deliveredTo.includes(currentUserId))) {
                    socket?.emit('message delivered', {
                        messageId: msg._id,
                        chatId: chatId,
                        senderId: msg.sender._id,
                        receiverId: currentUserId
                    });
                }
            });
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to fetch messages');
      setShowError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await post('/chats/read-all', { chatId });
      if (socket && socketConnected) {
        socket.emit('read messages', chatId);
      }
      // Mark messages we received as read
      setMessages(prev => prev.map(m => {
        if (String(m.sender._id) !== String(currentUserId) && 
            currentUserId &&
            !m.readBy?.includes(currentUserId)) {
          return { ...m, readBy: [...(m.readBy || []), currentUserId] };
        }
        return m;
      }));
    } catch (error) {
      console.log('Error marking messages as read:', error);
    }
  };

const sanitizeMessage = (text: string): string => {
  // ✅ FIXED: Proper HTML escaping for XSS prevention
  // Escape all HTML-special chars to prevent <script>alert(1)</script>
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;')
    .trim();
}
const sendMessage = async () => {
  const sanitizedText = sanitizeMessage(newMessage);
  if (!sanitizedText || !currentUserId || !socket || !socketConnected) return;

  // Optimistic UI Update: Immediately add the message to the list.
  // It will be replaced by the real message from the server later.
  const tempId = `temp_${Date.now()}`;
  const optimisticMessage: Message = {
    _id: tempId,
    status: 'sending',
    sender: { _id: currentUserId, username: 'You', profilePicture: '' },
    receiver: { _id: otherUserId, username: otherUsername, profilePicture: '' },
    bodyText: sanitizedText,
    content: sanitizedText,
    msgType: 'text',
    createdAt: new Date().toISOString(),
    readBy: [],
    deliveredTo: [],
    quotedMessage: quotedMessage ? {
      _id: quotedMessage._id,
      bodyText: quotedMessage.bodyText || quotedMessage.content || 'Media',
      sender: quotedMessage.sender,
    } : undefined,
  };

  // If we are replying to a media message specifically, try to preserve that type in the optimistic update
  if (quotedMessage && quotedMessage.msgType !== 'text' && optimisticMessage.quotedMessage) {
    optimisticMessage.quotedMessage.msgType = quotedMessage.msgType;
  }

  setMessages(prev => [...prev, optimisticMessage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
messageIdsRef.current.add(tempId);
        
        // ✅ NEW: Cleanup stale optimistic messages after 30s if no server confirmation
        const timeoutId = setTimeout(() => {
          if (messageIdsRef.current.has(tempId)) {
            setMessages(prev => {
              const newMsgs = prev.filter(m => m._id !== tempId);
              messageIdsRef.current.delete(tempId);
              return newMsgs;
            });
          }
        }, 30000) as unknown as NodeJS.Timeout;
        tempTimeouts.current.push(timeoutId);

  try {
    const socketMessageData: any = {
      sender: currentUserId,
      receiver: otherUserId,
      chat: chatId,
      bodyText: sanitizedText,
      content: sanitizedText,
      msgType: 'text',
    };

    // Validate quoted message
    if (quotedMessage && quotedMessage._id) {
      socketMessageData.quotedMsgId = quotedMessage._id;
    }

    socket.emit('new message', socketMessageData);

    // Clear quoted message after sending
    setQuotedMessage(null);
    
    updateConversation({
      conversationId: chatId,
      lastMessage: {
        text: sanitizedText,
        createdAt: new Date().toISOString(),
        sender: {
          _id: currentUserId,
          username: 'You',
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
  } catch (error: any) {
    console.error('Send message failed:', error);
    setError('Failed to send message');
    setShowError(true);
  }
};

  const handleTyping = (text: string) => {
    setNewMessage(text);
    
    if (!socketConnected || !socket || text.length === 0) return;
    
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

  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestMessageId) return;
    
    // console.log('Loading more messages, oldestMessageId:', oldestMessageId);
    await fetchMessages(true);
  }, [loadingMore, hasMore, oldestMessageId, fetchMessages]);

  // Refactored to use Reanimated & Gesture Handler for the specific bottom pull action
  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    
    // In an inverted list, offsetY = 0 is the newest message (bottom of chat)
    isAtBottom.value = offsetY <= 0;

    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const maxOffset = contentHeight - layoutHeight;
    
    // Load more logic (approaching oldest messages)
    if (offsetY > maxOffset - 100 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, loadingMore, loadMoreMessages, isAtBottom]);

  const triggerAnimatedCall = useCallback(() => {
    if (otherUserId && chatId && otherUserStatus) {
      initiateCall([otherUserId], chatId, otherUserId, { 
        username: otherUsername, 
        profilePicture: otherUserProfilePicture || otherUserStatus.profilePicture || ''
      }, false);
    } else {
      setError("Cannot initiate call right now.");
      setShowError(true);
    }
  }, [otherUserId, chatId, otherUsername, otherUserProfilePicture, otherUserStatus]);

  const pullGesture = Gesture.Pan()
    .onChange((event) => {
       // Dragging heavily at the bottom (offset <= 0)
       // A drag upwards on the screen is negative translationY. E.g. pulling up the content.
       // However, in inverted lists dragging down (positive translation) overscrolls the bottom.
       // The prompt says "upward drag from bottom". 
       // We'll track purely vertical drags when at bottom.
       if (isAtBottom.value && Math.abs(event.translationY) > 0) {
           pullDistance.value = Math.abs(event.translationY);
           runOnJS(setIsHoldingTop)(true);
           runOnJS(setCallProgress)(Math.min(pullDistance.value / 150, 1));
       }
    })
    .onEnd(() => {
       if (pullDistance.value > 150) {
          runOnJS(triggerAnimatedCall)();
       }
       pullDistance.value = withSpring(0);
       runOnJS(setIsHoldingTop)(false);
       runOnJS(setCallProgress)(0);
    });

  const animatedPullStyle = useAnimatedStyle(() => {
    return {
       transform: [{ translateY: withSpring(Math.max(0, 50 - pullDistance.value)) }],
       opacity: withSpring(Math.min(pullDistance.value / 100, 1))
    };
  });



  // Handle long press on message to reply
  const handleMessageLongPress = useCallback((message: Message) => {
    setQuotedMessage(message);
  }, []);

  // Focus input when quoted message changes
  useEffect(() => {
    if (quotedMessage) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [quotedMessage]);

  // Handle swipe to reply (WhatsApp style)
  const handleSwipeReply = useCallback((message: Message) => {
    setQuotedMessage(message);
  }, []);

  // Handle scroll to original message
  const handleReplyPress = useCallback((targetMessageId: string) => {
    // Data passed to FlatList is [...groupedMessages].reverse() because FlatList is inverted
    // So index 0 is the newest message.
    const reversedData = [...groupedMessages].reverse();
    const index = reversedData.findIndex(item => item.type === 'message' && item.data._id === targetMessageId);

    if (index !== -1) {
          flatListRef.current?.scrollToIndex({ index: Number(index), animated: true, viewPosition: 0.5 });
      
      // Highlight the message
      setHighlightedMessageId(targetMessageId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
    } else {
      setError("Original message not found in loaded messages.");
      setShowError(true);
    }
  }, [groupedMessages]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => (
    <MessageItem 
      item={item} 
      currentUserId={currentUserId} 
      isMessageRead={isMessageRead}
      onLongPress={handleMessageLongPress}
      onSwipeReply={handleSwipeReply}
      onReplyPress={handleReplyPress}
      highlightedMessageId={highlightedMessageId}
    />
  ), [currentUserId, isMessageRead, handleMessageLongPress, handleSwipeReply, handleReplyPress, highlightedMessageId]);

  // Render header for loading more indicator
  const renderHeader = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMoreContainer}>
        <Text style={styles.loadingMoreText}>Loading older messages...</Text>
      </View>
    );
  }, [loadingMore]);

  const reversedMessages = useMemo(() => [...groupedMessages].reverse(), [groupedMessages]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >

      {isHoldingTop && (
        <Animated.View style={[styles.callHoverContainer, animatedPullStyle]}>
          <View style={styles.callIconWrapper}>
            <Svg width="80" height="80" viewBox="0 0 80 80" style={styles.circularProgress}>
              <Circle cx="40" cy="40" r="36" stroke="#333" strokeWidth="4" fill="none" />
              <Circle
                cx="40"
                cy="40"
                r="36"
                stroke="#4ADDAE"
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - callProgress)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
            </Svg>
            <Ionicons name="call" size="32" color={callProgress >= 1 ? "#4ADDAE" : "#fff"} />
          </View>
          <Text style={styles.callHoverText}>
            {callProgress >= 1 ? "Calling..." : "Pull to Call"}
          </Text>
        </Animated.View>
      )}

      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size="24" color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.headerTouchable}
          onPress={() => router.push({
            pathname: '/chat/info',
            params: { 
              chatId, 
              otherUserId, 
              otherUsername 
            }
          })}
          activeOpacity={0.8}
        >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
          source={{
            uri: otherUserProfilePicture || otherUserStatus.profilePicture || 'https://via.placeholder.com/40'
          }}
          style={styles.profileImage}
        />

      <View style={styles.headerInfo}>
        <ThemedText style={styles.partnerName}>{otherUsername}</ThemedText>
        <View style={styles.statusRow}>
          {otherUserTyping ? (
            <Text style={styles.typingText}>Typing...</Text>
          ) : (
            <>
              {otherUserStatus.isOnline && <View style={styles.onlineDot} />}
              <Text style={styles.lastSeen} numberOfLines={1}>
                {otherUserStatus.isOnline 
                  ? 'Online' 
                  : formatLastSeen(otherUserStatus.lastSeen)}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  </TouchableOpacity>


      </View>

      <GestureDetector gesture={pullGesture}>
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          inverted
          renderItem={renderItem}
          keyExtractor={(item, index) => item.type === 'dateSeparator' ? `sep-${item.dateKey}-${Number(index)}` : `msg-${item.data._id}`}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={Platform.OS === 'android'}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={hasMore && !loadingMore && messages.length > 0 ? loadMoreMessages : null}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={renderHeader}
        />
      </GestureDetector>

      {/* Message status listener */}
      {(() => {
        useEffect(() => {
          const handleStatusUpdate = (event: CustomEvent<{ messageId: string; status: MessageStatus }>) => {
            console.log('ChatDetail: Status update:', event.detail);
            
            setMessages(prev => prev.map(msg => {
              if (String(msg._id) === event.detail.messageId) {
                return { ...msg, status: event.detail.status };
              }
              return msg;
            }));
          };

          window.addEventListener('messageStatusUpdate', handleStatusUpdate as EventListener);
          
          return () => {
            window.removeEventListener('messageStatusUpdate', handleStatusUpdate as EventListener);
          };
        }, []);
        return null;
      })()}

      {/* Input Area - Using column layout to properly stack reply preview and input */}
      <View style={[styles.inputContainer, quotedMessage && styles.inputContainerWithReply]}>
        {/* Reply Preview Bar */}
        {quotedMessage && (
          <View style={styles.replyPreviewContainer}>
            <View style={styles.replyPreviewLine} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                Replying to {String(quotedMessage.sender._id) === String(currentUserId) ? 'yourself' : quotedMessage.sender.username}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {quotedMessage.msgType === 'image' ? '📷 Photo' : (quotedMessage.msgType === 'video' ? '🎥 Video' : (quotedMessage.bodyText || quotedMessage.content || 'Media'))}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setQuotedMessage(null)} style={styles.cancelReplyButton}>
              <Ionicons name="close-circle" size="24" color="#666" />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Input row with TextInput and Send button */}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={newMessage}
            onChangeText={handleTyping}
            placeholder={quotedMessage ? "Write your reply..." : "Type a message..."}
            placeholderTextColor="#999"
            multiline={false}
            blurOnSubmit={false}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
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
      </View>
    </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 30) + 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
  },
  profileImage: {
  width: 40,
  height: 40,
  borderRadius: 20,
  marginRight: 10,
},
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerTouchable: {
    flex: 1,
    marginLeft: 12,
  },
  headerInfo: {
    flex: 1,
  },
  partnerName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  lastSeen: {
    color: '#8E8E93',
    fontSize: 13,
  },
  typingText: {
    color: '#4ADDAE',
    fontSize: 13,
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  messagesList: { flex: 1 },
  messagesContainer: { padding: 16, paddingTop: 8 },
  dateSeparator: { alignItems: 'center', marginVertical: 12 },
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
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#005c4b',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#202c33',
    borderBottomLeftRadius: 4,
  },
  highlightedMessage: {
    backgroundColor: '#3b4a54', // A slightly lighter/different shade to indicate highlight
    transform: [{ scale: 1.02 }],
  },
  messageText: { fontSize: 15, lineHeight: 20 },
  ownMessageText: { color: '#e9edef' },
  otherMessageText: { color: '#e9edef' },
  senderNameText: { color: '#4ADDAE', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  timestamp: { fontSize: 12, marginTop: 4 },
  ownTimestamp: { color: '#e0e0e0', textAlign: 'right' },
  otherTimestamp: { color: '#aaa' },
  timestampContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 12,
    color: '#e0e0e0',
  },
  sentIcon: {
    color: '#34B7F1',
  },
  retryButton: {
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255,0,0,0.2)',
  },
  retryIcon: {
    fontSize: 14,
    color: '#ff4444',
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 12,
    color: '#e0e0e0',
  },
  sentIcon: {
    color: '#34B7F1',
  },
  retryButton: {
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255,0,0,0.2)',
  },
  retryIcon: {
    fontSize: 14,
    color: '#ff4444',
    fontWeight: 'bold',
  },
  readStatus: { fontSize: 12, marginLeft: 8 },
  readStatusBlue: { color: '#34B7F1' },
  readStatusGray: { color: '#e0e0e0' },
  editedText: { fontSize: 12, marginTop: 2 },
  ownEditedText: { color: '#e0e0e0' },
  otherEditedText: { color: '#999' },
  inputContainer: { flexDirection: 'row', padding: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#202c33', backgroundColor: '#1f2c34', alignItems: 'flex-end' },
  inputContainerWithReply: { flexDirection: 'column', padding: 8, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#202c33', backgroundColor: '#1f2c34', alignItems: 'stretch' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
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
    backgroundColor: '#2a3942',
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#00a884',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: { backgroundColor: '#3b4a54' },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sendButtonTextDisabled: { color: '#8b9a9f' },
  callHoverContainer: { position: 'absolute', top: 100, left: 0, right: 0, alignItems: 'center', zIndex: 100, pointerEvents: 'none' },
  callIconWrapper: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 40 },
  circularProgress: { position: 'absolute' },
  callHoverText: { color: '#fff', marginTop: 12, fontWeight: 'bold', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  loadingMoreContainer: { padding: 12, alignItems: 'center' },
  loadingMoreText: { color: '#8E8E93', fontSize: 12 },
  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a3942', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  replyPreviewLine: { width: 3, height: '100%', backgroundColor: '#4ADDAE', borderRadius: 2, marginRight: 12 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { color: '#4ADDAE', fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  replyPreviewText: { color: '#aaa', fontSize: 14 },
  cancelReplyButton: { padding: 4 },
  quotedMessageContainer: {
    padding: 8,
    borderLeftWidth: 3,
    marginBottom: 6,
    borderRadius: 6,
  },
  ownQuotedMessage: { backgroundColor: 'rgba(0,0,0,0.15)', borderLeftColor: '#87ceeb' },
  otherQuotedMessage: { backgroundColor: 'rgba(255,255,255,0.05)', borderLeftColor: '#4ADDAE' },
  quotedMessageName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  ownQuotedName: { color: '#87ceeb' },
  otherQuotedName: { color: '#4ADDAE' },
  quotedMessageText: { fontSize: 13 },
  ownQuotedText: { color: '#e0e0e0' },
  otherQuotedText: { color: '#c0c0c0' },
});