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
  
  const updateConversation = useCallback((update: ConversationUpdate) => {
    console.log('Socket: Received conversation update:', update);
    
    setConversations(prevConversations => {
      const conversationId = update.conversationId;
      const existingIndex = prevConversations.findIndex(c => 
        String(c._id) === String(conversationId)
      );

      const senderObj = update.lastMessage?.sender;
      let senderInfo = senderObj;
      if (!senderObj || typeof senderObj !== 'object' || !senderObj.username) {
        // Fallback: If the backend hasn't been updated with populated sender info yet,
        // we construct a generic UI placeholder instead of aborting the fast update
        // and relying on a network refetch which could be stale.
        console.log('Socket: Missing populated sender info, constructing synthetic fallback...');
        senderInfo = {
          _id: update.senderId || 'unknown',
          username: 'New Message', // Generic fallback
          profilePicture: ''
        };
      }

      // Create updated lastMessage object
      const updatedLastMessage = {
        text: update.lastMessage?.text || 'Sent an attachment',
        createdAt: update.lastMessage?.createdAt || update.updatedAt || new Date().toISOString(),
        sender: senderInfo
      };

      if (existingIndex >= 0) {
        // Update existing conversation
        const updated = [...prevConversations];
        const currentChat = updated[existingIndex];
        
        // Calculate unread count
        // If sender is NOT me AND I am NOT actively viewing this chat, increment unread count
        let newUnreadCount = currentChat.unreadCount || 0;
        
        // Ensure proper string comparison for IDs
        const currentUserIdStr = currentUserIdRef.current ? String(currentUserIdRef.current) : '';
        const senderIdStr = update.senderId ? String(update.senderId) : '';
        
        const isFromMe = senderIdStr === currentUserIdStr;
        const isViewingChat = activeChatIdRef.current === String(conversationId);
        
        if (!isFromMe && !isViewingChat) {
          newUnreadCount += 1;
        }

        updated[existingIndex] = {
          ...currentChat,
          lastMessage: updatedLastMessage,
          unreadCount: newUnreadCount,
          updatedAt: update.updatedAt || new Date().toISOString()
        };
        
        // Re-sort by most recent
        updated.sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
          const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
          return bTime - aTime;
        });
        
        return updated;
      } else {
        // New conversation detected - fetch updated list to ensure consistency
        console.log('Socket: New conversation detected, fetching list...');
        // We can't construct the full chat object just from the update event
        get('/chats').then(data => {
          if (data && data.chats) {
            const sorted = data.chats.sort((a: any, b: any) => {
              const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
              const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
              return bTime - aTime;
            });
            // Force completely new array reference to ensure React triggers a re-render
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

  const connect = useCallback(async (force = false) => {
    // Prevent multiple socket initializations unless forced (e.g., account switch)
    if (socketRef.current && !force) return;

    if (force && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }

    try {
      const token = await AsyncStorage.getItem('token');
      const userId = await AsyncStorage.getItem('userId');
      
      if (!token || !userId) {
        console.log('Socket: No token or userId, skipping initialization');
        return;
      }

      setCurrentUserId(userId);

      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = newSocket;

      newSocket.on('connect', () => {
        console.log('Socket: Connected to server');
        setIsConnected(true);
        // Join user's personal room
        newSocket.emit('setup', { _id: userId });
      });

      newSocket.on('disconnect', () => {
        console.log('Socket: Disconnected from server');
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket: Connection error:', error.message);
        setIsConnected(false);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket: Initialization error:', error);
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

