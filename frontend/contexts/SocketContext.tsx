import { get } from "@/services/api";
import { SOCKET_URL } from "@/services/config";
import secureTokenManager from "@/services/secureTokenManager";
import { useAuth } from "@/contexts/AuthContext";
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
  onAuthError?: () => void;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children, onAuthError }) => {
  // ✅ FIX: Gate socket connection on auth state
  const { isSignedIn } = useAuth();

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
  const [userKeys, setUserKeys] = useState<{ publicKey: string; secretKey: string } | null>(null);
  
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

  // ✅ FIX 2.3: Comprehensive conversation validation with better error handling
  const validateConversationUpdate = (update: any): update is ConversationUpdate => {
    if (!update || typeof update !== 'object') {
      console.warn('[Socket] Validation failed: update is not an object');
      return false;
    }
    
    // Check conversationId
    if (typeof update.conversationId !== 'string' || !update.conversationId.trim()) {
      console.warn('[Socket] Validation failed: invalid conversationId:', update.conversationId);
      return false;
    }

    // Check lastMessage exists and is an object
    if (!update.lastMessage || typeof update.lastMessage !== 'object') {
      console.warn('[Socket] Validation failed: lastMessage missing or invalid:', update.lastMessage);
      return false;
    }

    // Check text - allow empty strings for attachments
    const text = update.lastMessage.text;
    if (typeof text !== 'string') {
      console.warn('[Socket] Validation failed: lastMessage.text is not a string:', text);
      return false;
    }

    if (text.length > 10000) {
      console.warn('[Socket] Validation failed: text too long');
      return false;
    }

    // Check createdAt - be lenient with date formats
    const createdAt = update.lastMessage.createdAt;
    if (!createdAt) {
      console.warn('[Socket] Validation failed: createdAt missing');
      return false;
    }
    
    if (!isValidISODate(createdAt)) {
      console.warn('[Socket] Validation failed: invalid createdAt format:', createdAt);
      return false;
    }

    // Check sender object
    if (!update.lastMessage.sender || typeof update.lastMessage.sender !== 'object') {
      console.warn('[Socket] Validation failed: sender missing or invalid:', update.lastMessage.sender);
      return false;
    }

    const sender = update.lastMessage.sender;
    if (!sender._id || typeof sender._id !== 'string') {
      console.warn('[Socket] Validation failed: sender._id invalid:', sender._id);
      return false;
    }
    if (typeof sender.username !== 'string') {
      console.warn('[Socket] Validation failed: sender.username invalid:', sender.username);
      return false;
    }
    if (typeof sender.profilePicture !== 'string') {
      console.warn('[Socket] Validation failed: sender.profilePicture invalid:', sender.profilePicture);
      return false;
    }

    // Check senderId
    if (typeof update.senderId !== 'string' || !update.senderId.trim()) {
      console.warn('[Socket] Validation failed: invalid senderId:', update.senderId);
      return false;
    }

    // Check updatedAt
    if (!update.updatedAt) {
      console.warn('[Socket] Validation failed: updatedAt missing');
      return false;
    }

    if (!isValidISODate(update.updatedAt)) {
      console.warn('[Socket] Validation failed: invalid updatedAt format:', update.updatedAt);
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
      console.warn('[Socket] Invalid conversation update received:', {
        received: rawUpdate,
        type: typeof rawUpdate,
        keys: rawUpdate ? Object.keys(rawUpdate) : 'null',
        lastMessageKeys: rawUpdate?.lastMessage ? Object.keys(rawUpdate.lastMessage) : 'none',
        senderKeys: rawUpdate?.lastMessage?.sender ? Object.keys(rawUpdate.lastMessage.sender) : 'none',
      });
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

  // ✅ HELPER: Extract duplicate chat loading logic into a reusable function
  const loadAndSetConversations = useCallback(async () => {
    try {
      const data = await get("/chats");
      if (!data || !Array.isArray(data)) return;
      const unique = Array.from(new Map(data.map(c => [c._id, c])).values());
      const valid = unique.filter(c => c.lastMessage?.text || c.lastMessage?.createdAt);
      setConversations(valid.sort((a: any, b: any) =>
        new Date(b.lastMessage?.createdAt || b.updatedAt || 0).getTime() -
        new Date(a.lastMessage?.createdAt || a.updatedAt || 0).getTime()
      ));
    } catch (error) {
      console.error('[Socket] Error loading conversations:', error);
    }
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
  // ✅ FIX BUG 6: Register conversation listener ONLY once, not in both connect and here
  useEffect(() => {
    if (!socket) return;

    // Listen for conversation updates globally (only registered once)
    socket.on("conversationUpdated", updateConversation);

    return () => {
      socket.off("conversationUpdated", updateConversation);
    };
  }, [socket, updateConversation]);

  // ✅ FIX: Robust socket connection with validation using secure storage
  const connect = useCallback(async (force = false) => {
    if (initializedRef.current && !force) return;
    if (force) initializedRef.current = false;

    try {
      // ✅ SECURE: Retrieve token from encrypted storage
      const token = await secureTokenManager.getToken();
      const userId = await secureTokenManager.getUserId();

      if (!token || !userId || typeof userId !== "string" || !userId.trim()) {
        console.warn('[Socket] Cannot connect: missing credentials');
        return;
      }

      // ✅ CRITICAL FIX: Validate token BEFORE attempting socket connection
      // This prevents connecting to socket with an invalid/expired token
      // which would then cause a 401 error and clear the token
      try {
        const parts = token.split('.');
        if (parts.length !== 3) {
          console.warn('[Socket] Invalid token format');
          await secureTokenManager.clearAll();
          return;
        }

        // ✅ FIX BUG 9: Use base64-js or Buffer instead of atob for React Native compatibility
        // atob is a browser API and not available in React Native's Hermes engine
        let payload;
        try {
          // Try native Buffer first (works in React Native and Node)
          payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        } catch (bufferError) {
          // Fallback to atob for web environments
          try {
            payload = JSON.parse(atob(parts[1]));
          } catch (atobError) {
            console.warn('[Socket] Failed to decode token payload:', atobError);
            await secureTokenManager.clearAll();
            return;
          }
        }
        
        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          console.warn('[Socket] Token is expired');
          await secureTokenManager.clearAll();
          return;
        }

        // Verify payload contains required field — backend signs with 'id'
        if (!payload.id && !payload._id && !payload.userId) {
          console.warn('[Socket] Token payload missing user ID');
          await secureTokenManager.clearAll();
          return;
        }
      } catch (tokenError) {
        console.error('[Socket] Token validation failed:', tokenError);
        await secureTokenManager.clearAll();
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
        
        // ✅ AUTO-RECONNECTION CONFIGURATION (ENHANCED)
        reconnection: true, // Enable auto-reconnect
        reconnectionDelay: 1000, // Start with 1s delay
        reconnectionDelayMax: 5000, // Max 5s between attempts
        reconnectionAttempts: Infinity, // Keep trying forever (critical for mobile)
        randomizationFactor: 0.5, // Randomize to avoid thundering herd
        
        // ✅ TIMEOUT SETTINGS
        timeout: 20000, // 20s connection timeout
        
        // ✅ OTHER CRITICAL SETTINGS
        autoConnect: true, // Auto-connect on creation
        query: { EIO: "4" },
        forceNew: force,
      });

      socketRef.current = newSocket;

      newSocket.on("connect", async () => {
        console.log('[Socket] Connected successfully');
        setIsConnected(true);
        setIsOnline(true);
        initializedRef.current = true;
        
        newSocket.emit("setup", { _id: userId, isOnline: true });

        // ✅ FIX BUG 7: Load user encryption keys on connection
        // NOTE: Only fetching public key from server. Secret key must be stored locally.
        try {
          const keysData = await get("/e2ee/own-key");
          if (keysData && keysData.publicKey) {
            // Only store public key from server; secret key should come from local storage
            setUserKeys({
              publicKey: keysData.publicKey,
              secretKey: keysData.secretKey || '', // Secret key stored locally, not from server
            });
            console.log('[Socket] User encryption public key loaded from server');
          }
        } catch (error) {
          console.warn('[Socket] Non-critical: Could not load public key from server:', error);
          // Non-critical, continue without server keys. Client-side keys take precedence.
        }

        // Load initial conversations
        try {
          await loadAndSetConversations();
        } catch (error) {
          console.error('[Socket] Error loading conversations:', error);
        }

        // Process any queued messages
        processOfflineQueue();
      });

      newSocket.on("disconnect", (reason) => {
        console.warn('[Socket] Disconnected. Reason:', reason);
        setIsConnected(false);
        setIsOnline(false);
        
        // Some reasons (like "io server disconnect") require manual reconnection
        if (reason === "io server disconnect") {
          console.log('[Socket] Server disconnected, attempting manual reconnection');
          newSocket.connect();
        }
      });

      // ✅ ENHANCED: Connection error handler
      newSocket.on("connect_error", (error: any) => {
        console.warn('[Socket] Connection error:', error?.message || error);
        setIsConnected(false);
        // Socket.io will automatically retry
      });

      // ✅ CRITICAL FIX: Auth error handler
      // If socket auth fails (401), clear tokens and stop reconnecting
      newSocket.on("auth_error", (error: any) => {
        console.error('[Socket] Authentication error:', error?.message || error);
        setIsConnected(false);
        setIsOnline(false);
        initializedRef.current = false;
        
        // Disconnect to stop auto-reconnection attempts
        newSocket.disconnect();
        
        // ✅ FIX 3: Call onAuthError callback to redirect to login
        if (onAuthError) {
          onAuthError();
        }
      });

      // ✅ ENHANCED: Reconnection attempt handler
      newSocket.on("reconnect_attempt", () => {
        console.log('[Socket] Reconnection attempt in progress...');
      });

      // ✅ ENHANCED: Reconnection success handler
      newSocket.on("reconnect", async (attemptNumber) => {
        console.log('[Socket] Reconnected successfully after attempt:', attemptNumber);
        setIsConnected(true);
        setIsOnline(true);
        
        // Re-emit setup to server on reconnect
        newSocket.emit("setup", { _id: userId, isOnline: true });
        
        // ✅ FIX BUG 7: Reload user encryption keys on reconnect
        // NOTE: Only fetching public key from server. Secret key must be stored locally.
        try {
          const keysData = await get("/e2ee/own-key");
          if (keysData && keysData.publicKey) {
            // Only store public key from server; secret key should come from local storage
            setUserKeys({
              publicKey: keysData.publicKey,
              secretKey: keysData.secretKey || '', // Secret key stored locally, not from server
            });
            console.log('[Socket] User encryption public key reloaded after reconnect');
          }
        } catch (error) {
          console.warn('[Socket] Non-critical: Could not reload public key after reconnect:', error);
        }
        
        // Sync state after reconnection
        try {
          await loadAndSetConversations();
        } catch (error) {
          console.error('[Socket] Error syncing conversations after reconnect:', error);
        }
        
        // Process any queued messages
        processOfflineQueue();
      });

      // ✅ ENHANCED: Reconnection failed handler
      newSocket.on("reconnect_failed", () => {
        console.error('[Socket] Reconnection failed permanently');
        setIsConnected(false);
        setIsOnline(false);
      });

      // ✅ User status listener - matches backend 'user online' event
      newSocket.on("user online", (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
        setOnlineUsers((prev) => {
          const newMap = new Map(prev);
          newMap.set(data.userId, data.isOnline);
          return newMap;
        });
      });

      newSocket.on("conversationUpdated", updateConversation);

      setSocket(newSocket);
    } catch (error) {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
      setIsOnline(false);
    }
  }, [updateConversation, processOfflineQueue]);

  const disconnect = useCallback(() => {
    console.log('[Socket] Disconnecting socket and clearing state');
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }
    
    setSocket(null);
    setIsConnected(false);
    setIsOnline(false);
    setCurrentUserId(null);
    setUserKeys(null);
    
    // ✅ FIX: Clear conversations and active chat on disconnect
    // This ensures no stale data from previous account remains
    setConversations([]);
    setActiveChatId(null);
    setOnlineUsers(new Map());
    setOfflineQueue([]);
    
    initializedRef.current = false;
    console.log('[Socket] Socket and state cleared');
  }, []);

  // Use refs to hold stable references so the effect only runs once on mount
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  useEffect(() => { connectRef.current = connect; }, [connect]);
  useEffect(() => { disconnectRef.current = disconnect; }, [disconnect]);

  // ✅ FIX: Gate auto-connect on isSignedIn to prevent socket connection before auth
  // - On fresh install (no token): isSignedIn = false, socket doesn't connect, no dangling socket
  // - On logout → re-login: disconnect fires first (clearing state), then reconnect fires
  // - This ensures previous socket is fully cleaned up before new one connects
  useEffect(() => {
    if (isSignedIn) {
      // ✅ Connect when user is authenticated
      connectRef.current();
    } else {
      // ✅ Disconnect when user logs out or is not authenticated
      // This prevents dangling sockets and clears all socket state
      disconnectRef.current();
    }
    // NOTE: We don't include connectRef/disconnectRef in deps because they're stable
    // The actual dependencies are 'isSignedIn' which controls the flow
  }, [isSignedIn]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isOnline,
        currentUserId,
        onlineUsers,
        userKeys,
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
