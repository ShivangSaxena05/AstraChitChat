import { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '@/contexts/SocketContext';

export interface Message {
  _id: string;
  status?: 'sending' | 'sent' | 'failed';
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
  content?: string;
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
  createdAt: string;
  readBy: string[];
  deliveredTo?: string[];
  reactions?: Array<{
    emoji: string;
    users: string[];
    userName?: string;
  }>;
}

export interface OtherUserStatus {
  isOnline: boolean;
  lastSeen: string | null;
}

/**
 * Custom hook to manage socket events for a chat
 * Handles:
 * - Message receiving and deduplication
 * - User online status
 * - Typing indicators
 * - Message read receipts
 * - Message delivery status
 */
export const useChatSocket = (
  chatId: string,
  otherUserId: string,
  currentUserId: string | null,
  onMessageReceived?: (message: Message) => void,
) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserStatus, setOtherUserStatus] = useState<OtherUserStatus>({
    isOnline: false,
    lastSeen: null,
  });

  const messageIdsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const otherUserIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);

  // Update refs when values change (to avoid dependency issues in socket listeners)
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    otherUserIdRef.current = otherUserId;
  }, [otherUserId]);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Cleanup old IDs to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      if (messageIdsRef.current.size > 1000) {
        messageIdsRef.current.clear();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Socket listeners for incoming messages and events
  useEffect(() => {
    if (!socket || !chatId || !currentUserId) return;

    socket.emit('join chat', chatId);

    const handleMessageReceived = (message: Message) => {
      const messageChatId =
        typeof message.chat === 'object' ? message.chat?._id : message.chat;

      if (String(messageChatId) !== String(chatId)) {
        return;
      }

      // Duplicate prevention using Set
      if (messageIdsRef.current.has(message._id)) {
        return;
      }

      messageIdsRef.current.add(message._id);

      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) {
          return prev;
        }

        const updated = [...prev, message].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        onMessageReceived?.(message);
        return updated;
      });
    };

    const handleUserOnline = (data: {
      userId: string;
      isOnline: boolean;
      lastSeen?: string;
    }) => {
      if (data.userId === otherUserIdRef.current) {
        setOtherUserStatus({
          isOnline: data.isOnline,
          lastSeen:
            data.lastSeen || (data.isOnline ? null : new Date().toISOString()),
        });
      }
    };

    const handleTyping = () => {
      setOtherUserTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setOtherUserTyping(false);
      }, 3000);
    };

    const handleStopTyping = () => {
      setOtherUserTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };

    const handleMessagesRead = (data?: { chatId?: string; readerId?: string }) => {
      if (data?.readerId && String(data.readerId) !== String(currentUserIdRef.current)) {
        return;
      }

      setMessages((prev) =>
        prev.map((m) => {
          if (
            String(m.sender._id) === String(currentUserIdRef.current) &&
            otherUserIdRef.current &&
            !m.readBy?.includes(otherUserIdRef.current)
          ) {
            return { ...m, readBy: [...(m.readBy || []), otherUserIdRef.current] };
          }
          return m;
        }),
      );
    };

    const handleMessageDelivered = (data?: {
      messageId?: string;
      receiverId?: string;
    }) => {
      if (!data?.messageId || !data?.receiverId) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) === String(data.messageId)) {
            if (!m.deliveredTo?.includes(String(data.receiverId))) {
              return {
                ...m,
                deliveredTo: [
                  ...(m.deliveredTo || []),
                  String(data.receiverId),
                ],
              };
            }
          }
          return m;
        }),
      );
    };

    // ============ REACTION HANDLERS ============
    const handleReactionAdded = (data: {
      messageId: string;
      emoji: string;
      userId: string;
      userName: string;
    }) => {
      if (!data?.messageId) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) === String(data.messageId)) {
            const reactions = m.reactions || [];
            const existingReaction = reactions.find((r: any) => r.emoji === data.emoji);

            if (existingReaction) {
              return {
                ...m,
                reactions: reactions.map((r: any) =>
                  r.emoji === data.emoji
                    ? { ...r, users: [...(r.users || []), data.userId] }
                    : r
                ),
              };
            } else {
              return {
                ...m,
                reactions: [
                  ...reactions,
                  { emoji: data.emoji, users: [data.userId], userName: data.userName },
                ],
              };
            }
          }
          return m;
        })
      );
    };

    const handleReactionRemoved = (data: {
      messageId: string;
      emoji: string;
      userId: string;
    }) => {
      if (!data?.messageId) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (String(m._id) === String(data.messageId)) {
            return {
              ...m,
              reactions: (m.reactions || [])
                .map((r: any) =>
                  r.emoji === data.emoji
                    ? {
                      ...r,
                      users: r.users?.filter((u: string) => String(u) !== String(data.userId)) || [],
                    }
                    : r
                )
                .filter((r: any) => (r.users?.length || 0) > 0),
            };
          }
          return m;
        })
      );
    };

    // ============ MESSAGE EDIT HANDLER ============
    const handleMessageEdited = (data: {
      messageId: string;
      bodyText: string;
      editedAt: string;
    }) => {
      if (!data?.messageId) return;

      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(data.messageId)
            ? { ...m, bodyText: data.bodyText, editedAt: data.editedAt }
            : m
        )
      );
    };

    // ============ MESSAGE DELETE HANDLER ============
    const handleMessageDeleted = (data: {
      messageId: string;
      unsentAt?: string;
    }) => {
      if (!data?.messageId) return;

      if (data.unsentAt) {
        // Soft delete (unsend)
        setMessages((prev) =>
          prev.map((m) =>
            String(m._id) === String(data.messageId)
              ? { ...m, unsentAt: data.unsentAt, bodyText: '[Message unsent]' }
              : m
          )
        );
      } else {
        // Hard delete
        setMessages((prev) => prev.filter((m) => String(m._id) !== String(data.messageId)));
      }
    };

    socket.on('message received', handleMessageReceived);
    socket.on('user online', handleUserOnline);
    socket.on('typing', handleTyping);
    socket.on('stop typing', handleStopTyping);
    socket.on('messages read', handleMessagesRead);
    socket.on('message delivered', handleMessageDelivered);
    socket.on('reaction-added', handleReactionAdded);
    socket.on('reaction-removed', handleReactionRemoved);
    socket.on('message-edited', handleMessageEdited);
    socket.on('message-unsent', handleMessageDeleted);
    socket.on('message-deleted', handleMessageDeleted);

    return () => {
      socket.off('message received', handleMessageReceived);
      socket.off('user online', handleUserOnline);
      socket.off('typing', handleTyping);
      socket.off('stop typing', handleStopTyping);
      socket.off('messages read', handleMessagesRead);
      socket.off('message delivered', handleMessageDelivered);
      socket.off('reaction-added', handleReactionAdded);
      socket.off('reaction-removed', handleReactionRemoved);
      socket.off('message-edited', handleMessageEdited);
      socket.off('message-unsent', handleMessageDeleted);
      socket.off('message-deleted', handleMessageDeleted);
    };
  }, [socket, chatId, otherUserId, currentUserId, onMessageReceived]);

  return {
    messages,
    setMessages,
    otherUserTyping,
    otherUserStatus,
    setOtherUserStatus,
    messageIdsRef,
    socket,
  };
};
