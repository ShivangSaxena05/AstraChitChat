import { get } from "@/services/api";
import { SOCKET_URL } from "@/services/config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { io, Socket } from "socket.io-client";

// ✅ FIX: Proper interfaces with type safety
interface Conversation {
  _id: string;
  lastMessage: {
    text: string;
    createdAt: string;
    sender: {
      _id: string;
      username: string;
      profilePicture: string;
    };
  };
  updatedAt: string;
  unreadCount: number;
}

interface ConversationUpdate {
  conversationId: string;
  lastMessage: {
    text: string;
    createdAt: string;
    sender: {
      _id: string;
      username: string;
      profilePicture: string;
    };
  };
  updatedAt: string;
  senderId: string;
  isNewMessage: boolean;
}

type MessageStatus = "sending" | "sent" | "failed" | "queued";

interface MessageQueueItem {
  tempId: string;
  chatId: string;
  receiverId: string;
  bodyText: string;
  content: string;
  msgType: "text";
  quotedMsgId?: string;
  createdAt: string;
  retryCount: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isOnline: boolean;
  currentUserId: string | null;
  onlineUsers: Map<string, boolean>;
  userKeys: { publicKey: string; secretKey: string } | null;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  updateConversation: (update: ConversationUpdate) => void;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  connect: (force?: boolean) => Promise<void>;
  disconnect: () => void;
  queueMessage: (queueItem: MessageQueueItem) => void;
  processOfflineQueue: () => Promise<void>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<MessageQueueItem[]>([]);
  
  const initializedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const onlineUsersRef = useRef<Map<string, boolean>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);

  // ✅ FIX 2.5: Validate ISO dates
  const isValidISODate = (dateString: string): boolean => {
    if (typeof dateString !== 'string') return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  };

  // ✅ FIX 2.3: Comprehensive conversation validation
  const validateConversationUpdate = (update: any): update is ConversationUpdate => {
    if (!update || typeof update !== 'object') return false;
    
    if (typeof update.conversationId !== 'string' || !update.conversationId.trim()) {
      return false;
    }

    if (!update.lastMessage || typeof update.lastMessage !== 'object') {
      return false;
    }

    if (typeof update.lastMessage.text !== 'string' || update.lastMessage.text.length === 0) {
      return false;
    }

    if (update.lastMessage.text.length > 10000) {
      return false; // Prevent oversized payloads
    }

    // Validate createdAt is valid ISO date
    if (!update.lastMessage.createdAt || !isValidISODate(update.lastMessage.createdAt)) {
      return false;
    }

    // Validate sender object
    if (!update.lastMessage.sender || typeof update.lastMessage.sender !== 'object') {
      return false;
    }

    const sender = update.lastMessage.sender;
    if (typeof sender._id !== 'string' || !sender._id.trim()) return false;
    if (typeof sender.username !== 'string' || !sender.username.trim()) return false;
    if (typeof sender.profilePicture !== 'string') return false;

    if (typeof update.senderId !== 'string' || !update.senderId.trim()) {
      return false;
    }

    if (!isValidISODate(update.updatedAt)) {
      return false;
    }

    return true;
  };

  // ✅ FIX 2.4: Memoized sorted conversations
  const getSortedConversations = useCallback((convs: Conversation[]): Conversation[] => {
    return [...convs].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : new Date(a.updatedAt).getTime();
      const bTime = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });
  }, []);

  const updateConversation = useCallback((rawUpdate: any) => {
    if (!validateConversationUpdate(rawUpdate)) {
      console.warn('[Socket] Invalid conversation update received:', rawUpdate);
      return;
    }

    setConversations((prevConversations) => {
      const conversationId = rawUpdate.conversationId;
      const existingIndex = prevConversations.findIndex(
        (c) => String(c._id) === String(conversationId)
      );

      const updatedLastMessage = {
        text: rawUpdate.lastMessage.text,
        createdAt: rawUpdate.lastMessage.createdAt,
        sender: rawUpdate.lastMessage.sender,
      };

      if (existingIndex >= 0) {
        const updated = [...prevConversations];
        const currentChat = updated[existingIndex];

        let newUnreadCount = currentChat.unreadCount || 0;
        const currentUserIdStr = currentUserIdRef.current ? String(currentUserIdRef.current) : "";
        const senderIdStr = rawUpdate.senderId ? String(rawUpdate.senderId) : "";

        // ✅ FIX 2.1: Proper unread count logic
        const isFromMe = senderIdStr === currentUserIdStr;
        const isViewingChat = activeChatIdRef.current === String(conversationId);

        if (!isFromMe && !isViewingChat) {
          newUnreadCount += 1;
        } else if (isViewingChat) {
          newUnreadCount = 0;
        }

        updated[existingIndex] = {
          ...currentChat,
          lastMessage: updatedLastMessage,
          unreadCount: newUnreadCount,
          updatedAt: rawUpdate.updatedAt,
        };

        return getSortedConversations(updated);
      } else {
        // New conversation
        const newConversation: Conversation = {
          _id: conversationId,
          lastMessage: updatedLastMessage,
          updatedAt: rawUpdate.updatedAt,
          unreadCount: currentUserIdRef.current === rawUpdate.senderId ? 0 : 1,
        };
        return getSortedConversations([...prevConversations, newConversation]);
      }
    });
  }, [getSortedConversations]);

  // ✅ FIX 2.2: Offline queue implementation
  const queueMessage = useCallback((queueItem: MessageQueueItem) => {
    setOfflineQueue((prev) => [...prev, queueItem]);
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (!socket || !isConnected || offlineQueue.length === 0) {
      return;
    }

    for (const item of offlineQueue) {
      try {
        socket.emit('new message', item, (ack: any) => {
          if (ack?.success) {
            setOfflineQueue((prev) => prev.filter((q) => q.tempId !== item.tempId));
          }
        });
      } catch (error) {
        console.error('[Socket] Error processing queued message:', error);
      }
    }
  }, [socket, isConnected, offlineQueue]);

  // ========================================================================
  // Global Socket Listeners
  // ========================================================================
  useEffect(() => {
    if (!socket) return;

    // Listen for conversation updates globally
    socket.on("conversationUpdated", updateConversation);

    return () => {
      socket.off("conversationUpdated", updateConversation);
    };
  }, [socket, updateConversation]);

  // ✅ FIX: Robust socket connection with validation
  const connect = useCallback(async (force = false) => {
    if (initializedRef.current && !force) return;
    if (force) initializedRef.current = false;

    try {
      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");

      if (!token || !userId || typeof userId !== "string" || !userId.trim()) {
        console.warn('[Socket] Cannot connect: missing credentials');
        return;
      }

      setCurrentUserId(userId);

      // Cleanup old socket
      if (socketRef.current && force) {
        socketRef.current.disconnect();
        socketRef.current.removeAllListeners();
        socketRef.current = null;
      }

      if (socketRef.current && !force) return;

      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        randomizationFactor: 0.5,
        reconnectionDelayMax: 10000,
        timeout: 30000,
        query: { EIO: "4" },
        forceNew: force,
      });

      socketRef.current = newSocket;

      newSocket.on("connect", async () => {
        setIsConnected(true);
        setIsOnline(true);
        initializedRef.current = true;
        
        newSocket.emit("setup", { _id: userId, isOnline: true });

        // Load initial conversations
        try {
          const data = await get("/chats");
          if (data && Array.isArray(data)) {
            setConversations(data.sort((a: any, b: any) => {
              const aTime = a.lastMessage?.createdAt
                ? new Date(a.lastMessage.createdAt).getTime()
                : new Date(a.updatedAt || 0).getTime();
              const bTime = b.lastMessage?.createdAt
                ? new Date(b.lastMessage.createdAt).getTime()
                : new Date(b.updatedAt || 0).getTime();
              return bTime - aTime;
            }));
          }
        } catch (error) {
          console.error('[Socket] Error loading conversations:', error);
        }

        // Process any queued messages
        processOfflineQueue();
      });

      newSocket.on("disconnect", (reason) => {
        setIsConnected(false);
        setIsOnline(false);
      });

      newSocket.on("userStatus", (data: { userId: string; isOnline: boolean }) => {
        setOnlineUsers((prev) => {
          const newMap = new Map(prev);
          newMap.set(data.userId, data.isOnline);
          return newMap;
        });
      });

      newSocket.on("conversationUpdated", updateConversation);

      newSocket.on("connect_error", (error) => {
        setIsConnected(false);
        setIsOnline(false);
      });

      newSocket.on("reconnect", () => {
        setIsConnected(true);
        setIsOnline(true);
        newSocket.emit("setup", { _id: userId, isOnline: true });
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
      setIsOnline(false);
    }
  }, [updateConversation, processOfflineQueue]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }
    setSocket(null);
    setIsConnected(false);
    setIsOnline(false);
    setCurrentUserId(null);
    initializedRef.current = false;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isOnline,
        currentUserId,
        onlineUsers,
        userKeys: null,
        conversations,
        setConversations,
        updateConversation,
        activeChatId,
        setActiveChatId,
        connect,
        disconnect,
        queueMessage,
        processOfflineQueue,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
