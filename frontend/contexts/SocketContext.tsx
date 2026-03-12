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

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: string | null;
  // Global conversation state for real-time updates
  conversations: any[];
  setConversations: React.Dispatch<React.SetStateAction<any[]>>;
  updateConversation: (update: ConversationUpdate) => void;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  connect: (force?: boolean) => Promise<void>;
  disconnect: () => void;
}


const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  currentUserId: null,
  conversations: [],
  setConversations: () => {},
  updateConversation: () => {},
  activeChatId: null,
  setActiveChatId: () => {},
  connect: async () => {},
  disconnect: () => {},
});


export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  // Keep ref in sync with state for use inside socket callbacks
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

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
          if (data && data.chats) {
            const sorted = data.chats.sort((a: any, b: any) => {
              const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
              const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
              return bTime - aTime;
            });
            setConversations([...sorted]);
          }
        }).catch(err => console.error('Failed to fetch new conversation:', err));
        
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
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10, // ✅ Increased attempts
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: force
      });

      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('Socket: ✅ Connected (attempts:', newSocket.io.opts.reconnectionAttempts, ')');
        setIsConnected(true);
        newSocket.emit('setup', { _id: userId });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket: Disconnected:', reason);
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket: ❌ Connect error:', error.message);
        setIsConnected(false);
      });

      // ✅ NEW: Reconnection events
      newSocket.on('reconnect', (attempts) => {
        console.log('Socket: 🔄 Reconnected after', attempts, 'attempts');
        setIsConnected(true);
        newSocket.emit('setup', { _id: userId });
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
      currentUserId,
      conversations,
      setConversations,
      updateConversation,
      activeChatId,
      setActiveChatId,
      connect,
      disconnect
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;

