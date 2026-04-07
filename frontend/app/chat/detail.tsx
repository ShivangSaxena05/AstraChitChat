import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  Alert,
  Text,
  TouchableOpacity,
} from 'react-native';
import {
  GestureHandlerRootView,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme-color';
import { get, post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useCall } from '@/contexts/CallContext';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useChatSocket, type Message } from '@/hooks/useChatSocket';
import { useGroupedMessages } from '@/hooks/useGroupedMessages';
import { sanitizeMessage } from '@/utils/chatUtils';
import { UserStatusHeader } from '@/components/chat/UserStatusHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInputBox } from '@/components/chat/MessageInputBox';
import { validateNewMessageEvent, validateTypingEvent, validateStopTypingEvent } from '@/types/socketEvents';

/**
 * ChatDetailScreen - Refactored Orchestrator Component
 * 
 * Responsibility: Orchestrate chat interactions
 * Delegates to:
 * - useChatSocket: Socket event handling
 * - useGroupedMessages: Message grouping
 * - UserStatusHeader: User info display
 * - MessageList: Message rendering
 * - MessageInputBox: Input handling
 * 
 * Lines: ~350 (down from 1863)
 */

// ✅ FIX (Bug #12): Interface for tracking failed messages
interface FailedMessage {
  id: string;
  text: string;
  error: string;
  timestamp: number;
}

export default function ChatDetailScreen() {
  const colors = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const inputRef = useRef<any>(null);
  const flatListRef = useRef<any>(null);

  // Route params with validation
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;

  // ✅ SAFETY CHECK: Validate critical route parameters on mount
  useEffect(() => {
    if (!chatId || !otherUserId || !otherUsername) {
      console.error('[ChatDetail] Missing critical route parameters:', {
        chatId: chatId || 'MISSING',
        otherUserId: otherUserId || 'MISSING',
        otherUsername: otherUsername || 'MISSING',
      });
      Alert.alert('Error', 'Invalid chat parameters. Returning to chat list.');
      router.back();
    }
  }, [chatId, otherUserId, otherUsername, router]);

  // Global state
  const { socket, isConnected, setConversations, updateConversation, setActiveChatId, onlineUsers } =
    useSocket();
  const { initiateCall } = useCall();

  // Local state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [otherUserProfilePicture, setOtherUserProfilePicture] = useState('');
  const [isFollowing, setIsFollowing] = useState(true);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [isHoldingTop, setIsHoldingTop] = useState(false);
  const [callProgress, setCallProgress] = useState(0);
  // ✅ FIX (Bug #12): Track failed messages for retry
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);

  // Animation refs
  const isAtBottom = useSharedValue(true);
  const pullDistance = useSharedValue(0);
  const errorOpacity = useSharedValue(0);
  const errorTranslateY = useSharedValue(100);

  // Utility refs
  const messageIdsRef = useRef<Set<string>>(new Set());
  // ✅ FIX (Bug #3): Keep currentUserId in ref for async operations
  // Prevents race conditions where currentUserId state is stale in async callbacks
  const currentUserIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ✅ FIX (Bug #13): Debounce typing indicator to reduce socket emissions
  const typingDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasEmittedTypingRef = useRef<boolean>(false);
  const tempTimeouts = useRef<NodeJS.Timeout[]>([]);
  const retryAttempts = useRef<Map<string, number>>(new Map());
  const sendMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastSentMessageRef = useRef<string | null>(null);
  // ✅ FIX (Bug #4): Atomic flag to prevent concurrent sends
  const isSendingRef = useRef(false);
  // ✅ FIX (Bug #4): Queue for messages sent while another is in progress
  const messageQueueRef = useRef<string[]>([]);

  // Socket logic (extracted to hook)
  const {
    messages,
    setMessages,
    otherUserTyping,
    otherUserStatus,
    setOtherUserStatus,
  } = useChatSocket(chatId, otherUserId, currentUserId);

  // Message grouping (extracted to hook)
  const groupedMessages = useGroupedMessages(messages);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      tempTimeouts.current.forEach((id) => clearTimeout(id));
      if (sendMessageTimeoutRef.current) {
        clearTimeout(sendMessageTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // ✅ FIX (Bug #8): Monitor socket connection status in real-time
  useEffect(() => {
    if (!isConnected) {
      // Socket disconnected - show error
      console.warn('[Chat] Socket disconnected, showing offline message');
      setError('Connection lost. Attempting to reconnect...');
      setShowError(true);
    } else {
      // Socket reconnected - clear error
      if (showError && error?.includes('Connection lost')) {
        console.log('[Chat] Socket reconnected, clearing error');
        setShowError(false);
        setError(null);
      }
    }
  }, [isConnected]);

  // Error snackbar animation
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

  // Memory cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      if (messageIdsRef.current.size > 1000) {
        messageIdsRef.current.clear();
        retryAttempts.current.clear();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ✅ FIX (Bug #3): Sync currentUserId state to ref to prevent stale state in async operations
  // This ensures fetchMessages and markAllAsRead always have the latest userId
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Fetch initial user info
  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Get current user ID — /profile/me is the correct endpoint
        const userData = await get('/profile/me');
        const currentId = String(userData._id || userData.id);
        setCurrentUserId(currentId);

        // Fetch other user status and profile
        const otherUserData = await get(`/profile/${otherUserId}`);
        setOtherUserStatus({
          isOnline: otherUserData.isOnline || false,
          lastSeen: otherUserData.lastSeen || null,
        });
        setOtherUserProfilePicture(otherUserData.profilePicture || '');
        setIsFollowing(otherUserData.isFollowing || false);

        setActiveChatId(chatId);
        setLoading(false);

        // Fetch initial messages with the currentId we just fetched
        // Pass currentId directly to avoid state update race conditions
        await fetchMessages(false, currentId);
      } catch (error: any) {
        setError(
          error.response?.data?.message || 'Failed to initialize chat',
        );
        setShowError(true);
        setLoading(false);
      }
    };

    initializeChat();
  }, [chatId, otherUserId]);

  // Fetch messages from API
  const fetchMessages = async (isLoadMore = false, userIdParam?: string) => {
    // ✅ FIX (Bug #3): Use userIdParam if provided (from initialization), 
    // otherwise use ref (safe for async operations), fallback to state as last resort
    const effectiveUserId = userIdParam || currentUserIdRef.current || currentUserId;
    
    // Early return if userId is not available
    if (!effectiveUserId) {
      console.warn('[Chat] Cannot fetch messages: userId not available yet');
      return;
    }
    
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
      const processedMessages = data.messages || [];

      if (processedMessages.length > 0) {
        processedMessages.forEach((msg: Message) => {
          messageIdsRef.current.add(msg._id);
        });
      }

      if (isLoadMore) {
        setMessages((prevMessages) => {
          const allMessagesMap = new Map<string, Message>(
            [...processedMessages, ...prevMessages].map((m) => [m._id, m]),
          );

          // ✅ FIX (Bug #10): Properly hydrate quoted messages from backend data
          const hydratedNewMessages = processedMessages.map((msg: Message) => {
            // If quotedMessage is already populated by backend, use it
            if (msg.quotedMessage) {
              return msg;
            }
            
            // If only quotedMsgId is present, try to hydrate from current messages
            if (msg.quotedMsgId) {
              // Handle both string IDs and object IDs
              const quotedId = typeof msg.quotedMsgId === 'string' ? msg.quotedMsgId : (msg.quotedMsgId as any)?._id;
              const found = allMessagesMap.get(quotedId);
              
              if (found) {
                return {
                  ...msg,
                  quotedMessage: {
                    _id: found._id,
                    bodyText: sanitizeMessage(
                      found.bodyText || found.content || '',
                    ),
                    sender: found.sender,
                    msgType: found.msgType,
                  },
                };
              } else {
                // Fallback: show placeholder for unavailable quoted message
                return {
                  ...msg,
                  quotedMessage: {
                    _id: quotedId,
                    bodyText: '[Original message not available]',
                    sender: { _id: '', username: 'Unknown', profilePicture: '' },
                    msgType: 'text'
                  }
                };
              }
            }
            return msg;
          });

          return [...hydratedNewMessages, ...prevMessages];
        });
      } else {
        const msgMap = new Map<string, Message>(
          processedMessages.map((m: Message) => [m._id, m]),
        );
        
        // ✅ FIX (Bug #10): Properly hydrate quoted messages from backend
        const hydratedMessages = processedMessages.map((msg: Message) => {
          // If quotedMessage is already populated by backend, use it
          if (msg.quotedMessage) {
            return msg;
          }
          
          // If only quotedMsgId is present, try to hydrate from current messages
          if (msg.quotedMsgId) {
            // Handle both string IDs and object IDs
            const quotedId = typeof msg.quotedMsgId === 'string' ? msg.quotedMsgId : (msg.quotedMsgId as any)?._id;
            const found = msgMap.get(quotedId);
            
            if (found) {
              return {
                ...msg,
                quotedMessage: {
                  _id: found._id,
                  bodyText: sanitizeMessage(
                    found.bodyText || found.content || '',
                  ),
                  sender: found.sender,
                  msgType: found.msgType,
                },
              };
            } else {
              // Fallback: show placeholder for unavailable quoted message
              return {
                ...msg,
                quotedMessage: {
                  _id: quotedId,
                  bodyText: '[Original message not available]',
                  sender: { _id: '', username: 'Unknown', profilePicture: '' },
                  msgType: 'text'
                }
              };
            }
          }
          return msg;
        });

        setMessages(hydratedMessages);

        // ✅ FIX: Use effectiveUserId instead of relying on state variable
        if (chatId && effectiveUserId) {
          markAllAsRead(effectiveUserId);
          if (data.messages && data.messages.length > 0) {
            data.messages.forEach((msg: Message) => {
              if (
                String(msg.sender._id) !== String(effectiveUserId) &&
                (!msg.deliveredTo ||
                  !msg.deliveredTo.includes(effectiveUserId))
              ) {
                socket?.emit('message delivered', {
                  messageId: msg._id,
                  chatId: chatId,
                  senderId: msg.sender._id,
                  receiverId: effectiveUserId,
                });
              }
            });
          }
        }
      }

      const newHasMore =
        data.hasMore !== false && (data.messages?.length || 0) >= 30;
      setHasMore(newHasMore);

      const newOldestId =
        processedMessages.length > 0
          ? processedMessages[0]._id
          : oldestMessageId;
      setOldestMessageId(newOldestId);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to fetch messages');
      setShowError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const markAllAsRead = async (userIdParam?: string) => {
    // ✅ FIX (Bug #3): Use userIdParam if provided (from initialization),
    // otherwise use ref (safe for async operations), fallback to state as last resort
    const effectiveUserId = userIdParam || currentUserIdRef.current || currentUserId;
    if (!effectiveUserId) {
      console.warn('[Chat] Cannot mark as read: userId not available yet');
      return;
    }

    try {
      await post('/chats/read-all', { chatId });
      if (socket) {
        socket.emit('read messages', chatId);
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (String(m.sender._id) !== String(effectiveUserId)) {
            return {
              ...m,
              readBy: [...(m.readBy || []), String(effectiveUserId)],
            };
          }
          return m;
        }),
      );
    } catch (error: any) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendMessage = async () => {
    const sanitizedText = sanitizeMessage(newMessage);
    if (
      !sanitizedText ||
      !currentUserId ||
      !socket ||
      !isConnected ||
      isSendingRef.current
    ) {
      // ✅ FIX (Bug #4): Queue message if send is already in progress
      if (isSendingRef.current && sanitizedText) {
        console.warn('[Chat] Send already in progress, queuing message');
        messageQueueRef.current.push(sanitizedText);
        return;
      }

      // ✅ FIX (Bug #8): Use synchronized isConnected state from SocketContext
      if (!isConnected) {
        setError('You are offline. Please check your internet connection.');
        setShowError(true);
      }
      return;
    }

    // ✅ FIX (Bug #4): Stronger debounce - prevent exact duplicate sends
    if (lastSentMessageRef.current === sanitizedText) {
      console.warn('[Chat] Duplicate message send attempt detected, ignoring');
      return;
    }

    // ✅ FIX (Bug #4): Set flag immediately to prevent concurrent sends
    isSendingRef.current = true;
    lastSentMessageRef.current = sanitizedText;

    if (sendMessageTimeoutRef.current) {
      clearTimeout(sendMessageTimeoutRef.current);
    }

    // Optimistic UI update
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: Message = {
      _id: tempId,
      status: 'sending',
      sender: { _id: currentUserId, username: 'You', profilePicture: '' },
      receiver: {
        _id: otherUserId,
        username: otherUsername,
        profilePicture: '',
      },
      bodyText: sanitizedText,
      content: sanitizedText,
      msgType: 'text',
      createdAt: new Date().toISOString(),
      readBy: [],
      deliveredTo: [],
      quotedMessage: quotedMessage
        ? {
            _id: quotedMessage._id,
            bodyText: quotedMessage.bodyText || quotedMessage.content || 'Media',
            sender: quotedMessage.sender,
          }
        : undefined,
    };

    if (
      quotedMessage &&
      quotedMessage.msgType !== 'text' &&
      optimisticMessage.quotedMessage
    ) {
      optimisticMessage.quotedMessage.msgType = quotedMessage.msgType;
    }

    setMessages((prev) =>
      [...prev, optimisticMessage].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    );
    messageIdsRef.current.add(tempId);

    // ✅ FIX: Cleanup stale optimistic messages after 30 seconds
    const timeoutId = setTimeout(() => {
      if (messageIdsRef.current.has(tempId)) {
        console.warn('[Chat] Optimistic message timed out, removing');
        setMessages((prev) => {
          const newMsgs = prev.filter((m) => m._id !== tempId);
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

      if (quotedMessage && quotedMessage._id) {
        socketMessageData.quotedMsgId = quotedMessage._id;
      }

      // ✅ FIX: Validate socket event before emitting
      if (!validateNewMessageEvent(socketMessageData)) {
        setError('Invalid message format. Please check your input and try again.');
        setShowError(true);
        return;
      }

      // ✅ FIX: Clear message before emitting to prevent race conditions
      setNewMessage('');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      // Emit message to socket
      socket.emit('new message', socketMessageData);
      socket.emit('stop typing', chatId);

      // Update conversation
      setQuotedMessage(null);
      updateConversation({
        conversationId: chatId,
        lastMessage: {
          text: sanitizedText,
          createdAt: new Date().toISOString(),
          sender: {
            _id: currentUserId,
            username: 'You',
            profilePicture: '',
          },
        },
        updatedAt: new Date().toISOString(),
        senderId: currentUserId,
        isNewMessage: true,
      });

      console.log('[Chat] Message sent successfully');
    } catch (error: any) {
      console.error('[Chat] Error sending message:', error);
      
      // ✅ FIX (Bug #12): Store failed message for retry
      const failedMsg: FailedMessage = {
        id: `failed_${Date.now()}`,
        text: sanitizedText,
        error: error.message || 'Failed to send',
        timestamp: Date.now(),
      };
      
      setFailedMessages(prev => [...prev, failedMsg]);
      setError(`Failed to send message: ${failedMsg.error}`);
      setShowError(true);
      
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      messageIdsRef.current.delete(tempId);
    } finally {
      // ✅ FIX (Bug #4): Reset flag and process queued messages
      isSendingRef.current = false;
      
      // Process queued message if exists
      if (messageQueueRef.current.length > 0) {
        const nextMessage = messageQueueRef.current.shift();
        if (nextMessage) {
          setNewMessage(nextMessage);
          // Allow UI to update before triggering next send
          setTimeout(() => sendMessage(), 100);
        }
      }
    }
  };

  // ✅ FIX (Bug #13): Debounce typing indicator to reduce socket emissions
  // Store typing state to track if we've already emitted the typing event
  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!socket || !socket.connected) return;

    // If text is empty, emit stop typing immediately
    if (text.length === 0) {
      if (hasEmittedTypingRef.current) {
        const stopEvent = { chatId };
        if (validateStopTypingEvent(stopEvent)) {
          socket.emit('stop typing', chatId);
          hasEmittedTypingRef.current = false;
        }
      }
      if (typingDebounceTimeoutRef.current) {
        clearTimeout(typingDebounceTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      return;
    }

    // Debounce the typing event emission
    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }

    // Set debounce timer (300ms - only emit if user hasn't typed in this time)
    typingDebounceTimeoutRef.current = setTimeout(() => {
      if (!hasEmittedTypingRef.current) {
        // ✅ FIX: Validate typing event before emitting
        const typingEvent = { chatId };
        if (validateTypingEvent(typingEvent)) {
          socket.emit('typing', chatId);
          hasEmittedTypingRef.current = true;
        } else {
          console.warn('[Chat] Invalid typing event data');
        }
      }
    }, 300);

    // Set stop typing timeout (auto-stop after 3 seconds of inactivity)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      // ✅ FIX: Validate stop typing event before emitting
      if (validateStopTypingEvent({ chatId })) {
        socket.emit('stop typing', chatId);
        hasEmittedTypingRef.current = false;
      } else {
        console.warn('[Chat] Invalid stop typing event data');
      }
    }, 3000);
  };

  // ✅ FIX (Bug #12): Retry failed message by restoring it to input field
  const retryFailedMessage = useCallback((failedMsg: FailedMessage) => {
    // Restore the failed message text to the input field
    setNewMessage(failedMsg.text);
    
    // Remove from failed messages list
    setFailedMessages(prev => prev.filter(m => m.id !== failedMsg.id));
    
    // Focus on input for user to review and resend
    if (inputRef.current) {
      inputRef.current.focus?.();
    }
    
    // Dismiss error message
    setShowError(false);
    
    console.log(`[Chat] Restoring failed message for retry: "${failedMsg.text}"`);
  }, []);

  // ✅ FIX (Bug #12): Dismiss a failed message without retrying
  const dismissFailedMessage = useCallback((failedMsgId: string) => {
    setFailedMessages(prev => prev.filter(m => m.id !== failedMsgId));
    if (failedMessages.length <= 1) {
      setShowError(false);
    }
  }, [failedMessages.length]);

  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    isAtBottom.value = offsetY <= 0;

    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const maxOffset = contentHeight - layoutHeight;

    if (offsetY < 100 && hasMore && !loadingMore) {
      fetchMessages(true);
    }
  }, [hasMore, loadingMore]);

  const handleMessageLongPress = useCallback((message: Message) => {
    setQuotedMessage(message);
  }, []);

  const handleSwipeReply = useCallback((message: Message) => {
    setQuotedMessage(message);
  }, []);

  // FIX: Add getItemLayout for better Android FlatList performance
  // This provides the FlatList with predictable item heights for faster scrolling
  const getItemLayout = useCallback(
    (data: any, index: number) => ({
      length: 100,  // Approximate height of each item (message or separator)
      offset: 100 * index,
      index,
    }),
    [],
  );

  const handleReplyPress = useCallback(
    (targetMessageId: string) => {
      if (!flatListRef.current) return;

      // Find message in the original (non-reversed) order
      const messageIndex = groupedMessages.findIndex(
        (item) => item.type === 'message' && item.data._id === targetMessageId,
      );

      if (messageIndex === -1) {
        setError('Original message not found in loaded messages.');
        setShowError(true);
        return;
      }

      // FIX: Add platform-specific delays for Android to ensure layout is ready
      const scrollDelay = Platform.OS === 'android' ? 300 : 100;

      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: messageIndex,
            animated: true,
            viewPosition: 0.5,
          });

          // Highlight the message
          setHighlightedMessageId(targetMessageId);
          setTimeout(() => {
            setHighlightedMessageId(null);
          }, 2000);
        } catch (error) {
          console.warn('[Chat] ScrollToIndex failed:', error);

          // Fallback: Use scrollToOffset with estimated position
          // Each message is approximately 100 points tall
          const estimatedOffset = messageIndex * 100;
          flatListRef.current?.scrollToOffset({
            offset: estimatedOffset,
            animated: true,
          });

          // Still highlight the message
          setHighlightedMessageId(targetMessageId);
          setTimeout(() => {
            setHighlightedMessageId(null);
          }, 2000);
        }
      }, scrollDelay);
    },
    [groupedMessages],
  );

  const triggerAnimatedCall = useCallback(async () => {
    if (!otherUserId || !chatId) {
      setError('Cannot initiate call right now.');
      setShowError(true);
      return;
    }

    try {
      await initiateCall(
        [otherUserId],
        chatId,
        otherUserId,
        {
          username: otherUsername,
          profilePicture: otherUserProfilePicture || '',
        },
        false,
      );
    } catch (err: any) {
      console.error('[Call] Failed to initiate:', err);
      setError(
        err.message ||
          'Failed to initiate call. Check permissions and connection.'
      );
      setShowError(true);
    }
  }, [otherUserId, chatId, otherUsername, otherUserProfilePicture]);

  // Pull-to-call gesture
  // FIX: Add platform-specific gesture configuration for Android
  const pullGesture = Gesture.Pan()
    .minDistance(Platform.OS === 'android' ? 15 : 10)
    .minPointers(1)
    .maxPointers(1)
    .onChange((event) => {
      if (isAtBottom.value && Math.abs(event.translationY) > 0) {
        pullDistance.value = Math.abs(event.translationY);
        runOnJS(setIsHoldingTop)(true);
        runOnJS(setCallProgress)(Math.min(pullDistance.value / 150, 1));
      }
    })
    .onEnd(() => {
      // FIX: Higher threshold on Android for more deliberate gesture
      const threshold = Platform.OS === 'android' ? 200 : 150;
      
      if (pullDistance.value > threshold) {
        triggerAnimatedCall().catch((err) => {
          console.error('[Gesture] Call initiation failed:', err);
        });
      }
      pullDistance.value = withSpring(0);
      runOnJS(setIsHoldingTop)(false);
      runOnJS(setCallProgress)(0);
    });

  const animatedPullStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: withSpring(Math.max(0, 50 - pullDistance.value)) },
      ],
      opacity: withSpring(Math.min(pullDistance.value / 100, 1)),
    };
  });

  // FIX: Platform-specific keyboard configuration for Android
  const getKeyboardConfig = useCallback(() => {
    if (Platform.OS === 'ios') {
      return {
        behavior: 'padding' as const,
        keyboardVerticalOffset: 90,
      };
    }

    // Android: Use padding behavior with 0 offset to let system handle it
    return {
      behavior: 'padding' as const,
      keyboardVerticalOffset: 0,
    };
  }, []);

  const keyboardConfig = useMemo(() => getKeyboardConfig(), [getKeyboardConfig]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ✅ EARLY RETURN: Prevent rendering with invalid parameters
  if (!chatId || !otherUserId || !currentUserId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <Text style={{ color: colors.error, fontSize: 16, marginBottom: 20 }}>
          {loading ? 'Loading chat...' : 'Invalid chat parameters'}
        </Text>
        {!loading && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: colors.tint, borderRadius: 8 }}
          >
            <Text style={{ color: colors.background, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[{ flex: 1, backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        {...keyboardConfig}
      >
        {isHoldingTop && (
          <Animated.View style={[styles.callHoverContainer, animatedPullStyle]}>
            <View style={styles.callIconWrapper}>
              <Svg
                width="80"
                height="80"
                viewBox="0 0 80 80"
                style={styles.circularProgress}
              >
                <Circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke={colors.textTertiary}
                  strokeWidth="4"
                  fill="none"
                />
                <Circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke={colors.success}
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - callProgress)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)"
                />
              </Svg>
              <Ionicons
                name="call"
                size={32}
                color={
                  callProgress >= 1 ? colors.success : colors.card
                }
              />
            </View>
          </Animated.View>
        )}

        <UserStatusHeader
          otherUsername={otherUsername}
          otherUserProfilePicture={otherUserProfilePicture}
          otherUserStatus={otherUserStatus}
          otherUserTyping={otherUserTyping}
          colors={colors}
          onBackPress={() => router.back()}
          onHeaderPress={() =>
            router.push({
              pathname: '/chat/info',
              params: {
                chatId,
                otherUserId,
                otherUsername,
              },
            })
          }
        />

        <MessageList
          ref={flatListRef}
          groupedMessages={groupedMessages}
          currentUserId={currentUserId}
          otherUserId={otherUserId}
          isLoading={loading}
          isLoadingMore={loadingMore}
          hasMore={hasMore}
          highlightedMessageId={highlightedMessageId}
          retryAttempts={retryAttempts}
          colors={colors}
          pullGesture={pullGesture}
          animatedPullStyle={animatedPullStyle}
          isHoldingTop={isHoldingTop}
          callProgress={callProgress}
          onMessageLongPress={handleMessageLongPress}
          onSwipeReply={handleSwipeReply}
          onReplyPress={handleReplyPress}
          onScroll={handleScroll}
          onLoadMore={() => fetchMessages(true)}
          getItemLayout={getItemLayout} // Add getItemLayout here
        />

        <MessageInputBox
          ref={inputRef}
          message={newMessage}
          quotedMessage={quotedMessage}
          // ✅ FIX (Bug #8): Use synchronized isConnected state from SocketContext
          isSocketConnected={isConnected}
          isFollowing={isFollowing}
          otherUsername={otherUsername}
          colors={colors}
          onChangeText={handleTyping}
          onSend={sendMessage}
          onCancelReply={() => setQuotedMessage(null)}
        />

        {/* Error snackbar for failed messages */}
        {failedMessages.length > 0 && (
          <Animated.View
            style={[
              styles.errorSnackbar,
              {
                opacity: errorOpacity,
                transform: [{ translateY: errorTranslateY }],
              },
            ]}
          >
            <Text style={styles.errorText}>
              {failedMessages[failedMessages.length - 1].error}
            </Text>
            <TouchableOpacity
              onPress={() =>
                dismissFailedMessage(failedMessages[failedMessages.length - 1].id)
              }
              style={styles.dismissButton}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Retry button for failed messages */}
        {failedMessages.length > 0 && (
          <TouchableOpacity
            onPress={() =>
              retryFailedMessage(failedMessages[failedMessages.length - 1])
            }
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    callHoverContainer: {
      position: 'absolute',
      top: 100,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 100,
      pointerEvents: 'none',
    },
    callIconWrapper: {
      width: 80,
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.shadow,
      borderRadius: 40,
    },
    circularProgress: { position: 'absolute' },
    errorSnackbar: {
      position: 'absolute',
      bottom: 50,
      left: 10,
      right: 10,
      backgroundColor: colors.error,
      borderRadius: 8,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 200,
    },
    errorText: {
      color: colors.background,
      flex: 1,
    },
    dismissButton: {
      marginLeft: 10,
      paddingVertical: 5,
      paddingHorizontal: 10,
      backgroundColor: colors.background,
      borderRadius: 4,
    },
    dismissButtonText: {
      color: colors.error,
      fontWeight: '600',
    },
    retryButton: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      right: 10,
      backgroundColor: colors.success,
      borderRadius: 8,
      padding: 10,
      alignItems: 'center',
      zIndex: 200,
    },
    retryButtonText: {
      color: colors.background,
      fontWeight: '600',
    },
  });
