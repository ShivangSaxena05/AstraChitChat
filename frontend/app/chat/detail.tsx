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
  const { socket, setConversations, updateConversation, setActiveChatId, onlineUsers } =
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

  // Animation refs
  const isAtBottom = useSharedValue(true);
  const pullDistance = useSharedValue(0);
  const errorOpacity = useSharedValue(0);
  const errorTranslateY = useSharedValue(100);

  // Utility refs
  const messageIdsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempTimeouts = useRef<NodeJS.Timeout[]>([]);
  const retryAttempts = useRef<Map<string, number>>(new Map());
  const sendMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastSentMessageRef = useRef<string | null>(null);
  const isSendingRef = useRef(false);

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
    // Use userIdParam if provided, otherwise fall back to state (for subsequent calls)
    const effectiveUserId = userIdParam || currentUserId;
    
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

          const hydratedNewMessages = processedMessages.map((msg: Message) => {
            if (msg.quotedMsgId && !msg.quotedMessage) {
              const found = allMessagesMap.get(msg.quotedMsgId);
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
        const hydratedMessages = processedMessages.map((msg: Message) => {
          if (msg.quotedMsgId && !msg.quotedMessage) {
            const found = msgMap.get(msg.quotedMsgId);
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
    // Use provided userId or fall back to state
    const effectiveUserId = userIdParam || currentUserId;
    if (!effectiveUserId) return;

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
      !socket.connected ||
      isSendingRef.current
    ) {
      if (!socket?.connected) {
        setError('You are offline. Trying to reconnect...');
        setShowError(true);
      }
      return;
    }

    // ✅ FIX: Stronger debounce using both ref and set
    if (lastSentMessageRef.current === sanitizedText) {
      console.warn('[Chat] Duplicate message send attempt detected, ignoring');
      return;
    }

    // ✅ FIX: Prevent concurrent sends with flag
    if (isSendingRef.current) {
      console.warn('[Chat] Send already in progress, ignoring duplicate request');
      return;
    }

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
      setError('Failed to send message');
      setShowError(true);
      
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      messageIdsRef.current.delete(tempId);
    } finally {
      // ✅ FIX: Always reset the sending flag
      isSendingRef.current = false;
    }
  };

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!socket || !socket.connected || text.length === 0) return;

    socket.emit('typing', chatId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop typing', chatId);
    }, 2000);
  };

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

  const handleReplyPress = useCallback(
    (targetMessageId: string) => {
      const reversedData = [...groupedMessages].reverse();
      const index = reversedData.findIndex(
        (item) => item.type === 'message' && item.data._id === targetMessageId,
      );

      if (index !== -1) {
        flatListRef.current?.scrollToIndex({
          index: Number(index),
          animated: true,
          viewPosition: 0.5,
        });

        setHighlightedMessageId(targetMessageId);
        setTimeout(() => {
          setHighlightedMessageId(null);
        }, 2000);
      } else {
        setError('Original message not found in loaded messages.');
        setShowError(true);
      }
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
  const pullGesture = Gesture.Pan()
    .onChange((event) => {
      if (isAtBottom.value && Math.abs(event.translationY) > 0) {
        pullDistance.value = Math.abs(event.translationY);
        runOnJS(setIsHoldingTop)(true);
        runOnJS(setCallProgress)(Math.min(pullDistance.value / 150, 1));
      }
    })
    .onEnd(() => {
      if (pullDistance.value > 150) {
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
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
        />

        <MessageInputBox
          ref={inputRef}
          message={newMessage}
          quotedMessage={quotedMessage}
          isSocketConnected={socket?.connected || false}
          isFollowing={isFollowing}
          otherUsername={otherUsername}
          colors={colors}
          onChangeText={handleTyping}
          onSend={sendMessage}
          onCancelReply={() => setQuotedMessage(null)}
        />
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
  });
