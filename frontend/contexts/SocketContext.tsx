import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOCKET_URL } from '@/services/config';
import { get } from '@/services/api';

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

type MessageStatus = 'sending' | 'sent' | 'failed' | 'queued';

interface MessageQueueItem {
  tempId: string;
  chatId: string;
  receiverId: string;
  bodyText: string;
  content: string;
  msgType: 'text';
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
  // Global conversation state for real-time updates
  conversations: any[];
  setConversations: React.Dispatch<React.SetStateAction<any[]>>;
  updateConversation: (update: ConversationUpdate) => void;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  connect: (force?: boolean) => Promise<void>;
  disconnect: () => void;
  queueMessage: (queueItem: MessageQueueItem) => void;
}



const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isOnline: false,
  currentUserId: null,
  onlineUsers: new Map(),
  userKeys: null,
  conversations: [],
  setConversations: () => {},
  updateConversation: () => {},
  activeChatId: null,
  setActiveChatId: () => {},
  connect: async () => {},
  disconnect: () => {},
  queueMessage: () => {},
});



export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, boolean>>(new Map());
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<MessageQueueItem[]>([]);
  const initializedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const onlineUsersRef = useRef<Map<string, boolean>>(new Map());


  // Keep ref in sync with state for use inside socket callbacks
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Sync onlineUsers ref
  useEffect(() => {
    onlineUsersRef.current = onlineUsers;
  }, [onlineUsers]);


  // ========================================================================
  // Global Conversation Update Handler
  // This is exposed to all components so they can update conversations
  // without needing to refetch from the server.
  // ========================================================================
  
  // ✅ SECURITY: Input validation for conversation updates
  const validateConversationUpdate = (update: any): update is ConversationUpdate => {
    return update &&
      typeof update.conversationId === 'string' &&
      update.lastMessage &&
      typeof update.lastMessage.text === 'string' &&
      typeof update.lastMessage.createdAt === 'string' &&
      update.lastMessage.sender &&
      typeof update.senderId === 'string' &&
      update.lastMessage.text.length < 1000; // Prevent oversized payloads
  };

  const updateConversation = useCallback((rawUpdate: any) => {
    if (!validateConversationUpdate(rawUpdate)) {
      console.warn('Socket: Invalid conversation update rejected:', rawUpdate);
      return;
    }

    console.log('Socket: Validated conversation update:', rawUpdate);
    
    setConversations(prevConversations => {
      const conversationId = rawUpdate.conversationId;
      const existingIndex = prevConversations.findIndex(c => 
        String(c._id) === String(conversationId)
      );

      const senderObj = rawUpdate.lastMessage?.sender;
      let senderInfo = senderObj;
      if (!senderObj || typeof senderObj !== 'object' || !senderObj.username) {
        console.log('Socket: Missing populated sender info, constructing synthetic fallback...');
        senderInfo = {
          _id: rawUpdate.senderId || 'unknown',
          username: 'New Message',
          profilePicture: ''
        };
      }

      const updatedLastMessage = {
        text: rawUpdate.lastMessage.text || 'Sent an attachment',
        createdAt: rawUpdate.lastMessage.createdAt || rawUpdate.updatedAt || new Date().toISOString(),
        sender: senderInfo
      };

      if (existingIndex >= 0) {
        const updated = [...prevConversations];
        const currentChat = updated[existingIndex];
        
        let newUnreadCount = currentChat.unreadCount || 0;
        const currentUserIdStr = currentUserIdRef.current ? String(currentUserIdRef.current) : '';
        const senderIdStr = rawUpdate.senderId ? String(rawUpdate.senderId) : '';
        
        const isFromMe = senderIdStr === currentUserIdStr;
        const isViewingChat = activeChatIdRef.current === String(conversationId);
        
        if (!isFromMe && !isViewingChat) {
          newUnreadCount += 1;
        }

        updated[existingIndex] = {
          ...currentChat,
          lastMessage: updatedLastMessage,
          unreadCount: newUnreadCount,
          updatedAt: rawUpdate.updatedAt || new Date().toISOString()
        };
        
        updated.sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
          const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
          return bTime - aTime;
        });
        
        return updated;
      } else {
        console.log('Socket: New conversation detected, fetching list...');
        get('/chats').then(data => {
          if (data) {
            const sorted = data.sort((a: any, b: any) => {
              const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
              const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
              return bTime - aTime;
            });
            setConversations([...sorted]);
          }
        })
        
        return prevConversations;
      }
    });
  }, []);

  // ========================================================================
  // Global Socket Listeners
  // ========================================================================
  useEffect(() => {
    if (!socket) return;

    // Listen for conversation updates globally
    socket.on('conversationUpdated', updateConversation);

    return () => {
      socket.off('conversationUpdated', updateConversation);
    };
  }, [socket, updateConversation]);

  // ✅ FIXED: Robust reconnect + validation
  const connect = useCallback(async (force = false) => {
    if (socketRef.current && !force) return;

    if (force && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }

    try {
      const token = await AsyncStorage.getItem('token');
      const userId = await AsyncStorage.getItem('userId');
      
      if (!token || !userId || typeof userId !== 'string') {
        console.log('Socket: Invalid auth, skipping');
        return;
      }

      setCurrentUserId(userId);

        const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'], // ✅ Fallback for Render cold starts
        reconnection: true,
        reconnectionAttempts: 15, // ✅ More attempts for prod
        reconnectionDelay: 1000,
        randomizationFactor: 0.5,
        reconnectionDelayMax: 10000, // ✅ 10s max delay
        timeout: 30000, // ✅ 30s for Render cold starts
        query: { EIO: '4' }, // ✅ Engine.IO v4 compatibility
        forceNew: force
      });

      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('Socket: ✅ Connected (attempts:', newSocket.io.opts.reconnectionAttempts, ')');
        setIsConnected(true);
        newSocket.emit('setup', { _id: userId, isOnline: true }); // Emit online status
      });


      newSocket.on('disconnect', (reason) => {
        console.log('Socket: Disconnected:', reason);
        setIsConnected(false);
        if (currentUserId) {
          newSocket.emit('userOffline', { _id: currentUserId });
        }
      });

      // Online status listener
      newSocket.on('userStatus', (data: { userId: string; isOnline: boolean }) => {
        setOnlineUsers(prev => {
          const newMap = new Map(prev);
          newMap.set(data.userId, data.isOnline);
          return newMap;
        });
      });

      // Message status updates (sending → sent/failed)
      newSocket.on('message status', (data: { messageId: string; status: 'sending' | 'sent' | 'failed' }) => {
        console.log('Socket: Message status update:', data);
        // Emit to all chat detail screens via custom event
        window.dispatchEvent(new CustomEvent('messageStatusUpdate', { detail: data }));
      });


      newSocket.on('connect_error', (error) => {
        console.error('Socket: ❌ Connect error:', error.message);
        // ✅ Render-specific handling
        if (error.message.includes('timeout') || error.message.includes('handshake')) {
          console.log('Socket: Render cold start detected, retrying with polling...');
        }
        setIsConnected(false);
      });

      // ✅ NEW: Reconnection events
      newSocket.on('reconnect', (attempts) => {
        console.log('Socket: 🔄 Reconnected after', attempts, 'attempts');
        setIsConnected(true);
        newSocket.emit('setup', { _id: userId, isOnline: true });
      });


      newSocket.on('reconnect_error', (error) => {
        console.error('Socket: Reconnect failed:', error.message);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket: Init failed:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }
    setSocket(null);
    setIsConnected(false);
    setCurrentUserId(null);
  }, []);

  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <SocketContext.Provider value={{ 
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
      queueMessage: () => {},
    }}>
      {children}
    </SocketContext.Provider>

  );
};

export default SocketContext;

