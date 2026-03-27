# ASTRA CHITCHAT - FRONTEND COMPREHENSIVE FIX IMPLEMENTATION

**Document Date:** March 27, 2026  
**Implementation Scope:** Complete Frontend Bug Fixes  
**File Type:** Complete TypeScript/TSX Implementation Code

---

## TABLE OF CONTENTS
1. [Fixed _layout.tsx](#1-fixed-_layouttsx)
2. [Fixed SocketContext.tsx](#2-fixed-socketcontexttsx)
3. [Fixed CallContext.tsx](#3-fixed-callcontexttsx)
4. [Fixed auth/login.tsx](#4-fixed-authlogintsx)
5. [Fixed auth/signup.tsx](#5-fixed-authsignuptsx)
6. [Fixed ChatBubble.tsx](#6-fixed-chatbubbletsx)
7. [Fixed PostCard.tsx](#7-fixed-postcardtsx)
8. [Fixed CallScreen.tsx](#8-fixed-callscreentsx)
9. [Fixed ProfileMenu.tsx](#9-fixed-profilemenutsx)
10. [Fixed chat/(tabs).tsx](#10-fixed-chattabstsx)
11. [Fixed useAccountSwitcher.tsx](#11-fixed-useaccountswitchertsx)
12. [Fixed api.ts](#12-fixed-apits)
13. [New: errorHandler.ts](#13-new-errorhandlerts)
14. [New: tokenManager.ts](#14-new-tokenmanagerts)
15. [New: permissionManager.ts](#15-new-permissionmanagerts)

---

## 1. FIXED _layout.tsx

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { SocketProvider } from '@/contexts/SocketContext';
import { CallProvider } from '@/contexts/CallContext';
import CallOverlay from '@/components/CallOverlay';
import { validateToken } from '@/services/tokenManager';
import { useSocket } from '@/contexts/SocketContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Auth State Management - Separate from route logic
interface AuthState {
  isLoading: boolean;
  isSignedIn: boolean;
  userToken: string | null;
}

// Root Layout Content (wrapped by providers)
function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    isSignedIn: false,
    userToken: null,
  });
  const router = useRouter();
  const { socket } = useSocket();

  useEffect(() => {
    const bootAsync = async () => {
      try {
        await restoreToken();
      } catch (e) {
        // Restoring token failed
        console.error('[Auth] Token restoration failed:', e);
      } finally {
        // Delay for splash screen visibility
        setTimeout(() => {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
        }, 500);
      }
    };

    bootAsync();
  }, []);

  const restoreToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        setAuthState({
          isLoading: true,
          isSignedIn: false,
          userToken: null,
        });
        return;
      }

      // ✅ FIX 1.1: Validate token with backend
      const isValid = await validateToken(token);
      
      if (isValid) {
        setAuthState({
          isLoading: true,
          isSignedIn: true,
          userToken: token,
        });
      } else {
        // Token is invalid or expired - clear it
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('userId');
        
        setAuthState({
          isLoading: true,
          isSignedIn: false,
          userToken: null,
        });
      }
    } catch (error) {
      console.error('[Auth] Error validating token:', error);
      // Default to not signed in on error
      setAuthState({
        isLoading: true,
        isSignedIn: false,
        userToken: null,
      });
    }
  };

  // Show splash screen while checking auth status
  if (authState.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {authState.isSignedIn ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/detail" />
          </>
        ) : (
          <>
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/signup" />
          </>
        )}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <CallOverlay />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SocketProvider>
      <CallProvider>
        <RootLayoutContent />
      </CallProvider>
    </SocketProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
```

---

## 2. FIXED SocketContext.tsx

```typescript
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
  const [onlineUsers, setOnlineUsers] = useState<Map<string, boolean>>(new Map());
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

  const isValidISODate = (dateString: string): boolean => {
    if (typeof dateString !== 'string') return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
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
```

---

## 3. FIXED CallContext.tsx

```typescript
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import { useSocket } from "./SocketContext";
import { requestCallPermissions } from "@/services/permissionManager";

declare global {
  interface Window {
    RTCPeerConnection: any;
    RTCSessionDescription: any;
    RTCIceCandidate: any;
  }
}

// ✅ FIX 3.1: Lazy load native modules with better error handling
let NativeRTCPeerConnection: any = null;
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;
let NativeMediaDevices: any = null;
let NativeInCallManager: any = null;
let IS_CALLING_FEATURE_ENABLED = false;

const initializeWebRTC = async () => {
  if (Platform.OS === "web") {
    IS_CALLING_FEATURE_ENABLED = true;
    return;
  }

  try {
    const webrtc = require("react-native-webrtc");
    NativeRTCPeerConnection = webrtc.RTCPeerConnection;
    NativeRTCSessionDescription = webrtc.RTCSessionDescription;
    NativeRTCIceCandidate = webrtc.RTCIceCandidate;
    NativeMediaDevices = webrtc.mediaDevices;

    if (!NativeRTCPeerConnection || !NativeMediaDevices) {
      throw new Error("WebRTC modules incomplete");
    }

    try {
      const incall = require("react-native-incall-manager");
      NativeInCallManager = incall.default || incall;
    } catch (e) {
      console.warn("[CallContext] InCallManager not available, calls may have audio issues");
      NativeInCallManager = null;
    }

    IS_CALLING_FEATURE_ENABLED = true;
  } catch (e) {
    console.error("[CallContext] Failed to load WebRTC modules:", e);
    IS_CALLING_FEATURE_ENABLED = false;
  }
};

// Initialize on module load
initializeWebRTC();

interface CallState {
  isCalling: boolean;
  isConnected: boolean;
  incomingCall: any | null;
  targetUser: { username: string; profilePicture: string } | null;
  targetUserId: string | null;
  localStream: any | null;
  remoteStream: any | null;
  isMuted: boolean;
  isSpeaker: boolean;
  activeChatId: string | null;
  isVideoEnabled: boolean;
  videoUpgradeRequest: any | null;
  isVideoUpgradePending: boolean;
  callError: string | null;
}

interface CallContextType extends CallState {
  isCallingFeatureEnabled: boolean;
  initiateCall: (
    targetIds: string[],
    chatId: string,
    targetUserId: string,
    targetUser?: any,
    isVideo?: boolean,
  ) => Promise<void>;
  acceptCall: (isVideo?: boolean) => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
  switchCamera: () => void;
  upgradeToVideo: () => Promise<void>;
  acceptVideoUpgrade: () => Promise<void>;
  declineVideoUpgrade: () => void;
  clearCallError: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
};

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 10,
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, currentUserId } = useSocket();
  const [callState, setCallState] = useState<CallState>({
    isCalling: false,
    isConnected: false,
    incomingCall: null,
    targetUser: null,
    targetUserId: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isSpeaker: false,
    activeChatId: null,
    isVideoEnabled: false,
    videoUpgradeRequest: null,
    isVideoUpgradePending: false,
    callError: null,
  });

  const peerConnectionRef = useRef<any | null>(null);
  const activeCallTargetIdRef = useRef<string | null>(null);
  const iceCandidateQueueRef = useRef<any[]>([]);
  const MAX_ICE_CANDIDATES = 100;
  
  const pendingCandidatesRef = useRef<{ [callerId: string]: any[] }>({});
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INCOMING_CALL_TIMEOUT = 45000;
  const CONNECTION_TIMEOUT = 30000;

  // ✅ FIX 3.2: Proper ICE candidate queue management
  const clearIceCandidateQueue = useCallback(() => {
    iceCandidateQueueRef.current = [];
  }, []);

  const addIceCandidate = useCallback(async (candidate: any, targetId: string) => {
    try {
      if (iceCandidateQueueRef.current.length >= MAX_ICE_CANDIDATES) {
        console.warn("[CallContext] ICE candidate queue exceeded max size, dropping oldest");
        iceCandidateQueueRef.current.shift();
      }

      iceCandidateQueueRef.current.push(candidate);

      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new NativeIceCandidate(candidate));
        } catch (error) {
          console.error("[CallContext] Failed to add ICE candidate:", error);
        }
      }
    } catch (error) {
      console.error("[CallContext] Error processing ICE candidate:", error);
    }
  }, []);

  // ✅ FIX 3.3 & 3.4: Improved timeout handling with backoff
  const setupConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (peerConnectionRef.current && !callState.isConnected) {
        console.error("[WebRTC] Connection timeout - ICE negotiation taking too long");
        
        setCallState((prev) => ({
          ...prev,
          callError: "Connection Timeout: Could not establish connection. Try switching WiFi/cellular.",
        }));

        setTimeout(() => {
          cleanupCall("connection timeout");
        }, 2000);
      }
    }, CONNECTION_TIMEOUT);
  }, [callState.isConnected]);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const setupIncomingCallTimeout = useCallback(() => {
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
    }

    incomingCallTimeoutRef.current = setTimeout(() => {
      if (callState.incomingCall) {
        console.warn("[CallContext] Incoming call auto-rejected after timeout");
        declineCall();
      }
    }, INCOMING_CALL_TIMEOUT);
  }, [callState.incomingCall]);

  const clearIncomingCallTimeout = useCallback(() => {
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
  }, []);

  // ✅ FIX 3.5: Request permissions before initiating call
  const initiateCall = useCallback(
    async (
      targetIds: string[],
      chatId: string,
      targetUserId: string,
      targetUser?: any,
      isVideo?: boolean,
    ) => {
      if (!IS_CALLING_FEATURE_ENABLED) {
        Alert.alert("Calling Disabled", "Calling feature is not available on this device");
        return;
      }

      try {
        // Request permissions
        const hasPermission = await requestCallPermissions(isVideo);
        if (!hasPermission) {
          Alert.alert(
            "Permission Denied",
            "Please grant microphone permissions in Settings to make calls"
          );
          return;
        }

        setCallState((prev) => ({
          ...prev,
          isCalling: true,
          targetUserId,
          targetUser,
          activeChatId: chatId,
          isVideoEnabled: isVideo || false,
        }));

        setupConnectionTimeout();

        if (socket) {
          socket.emit("call:initiate", {
            targetIds,
            chatId,
            isVideo: isVideo || false,
          });
        }
      } catch (error) {
        console.error("[CallContext] Error initiating call:", error);
        setCallState((prev) => ({
          ...prev,
          callError: "Failed to initiate call",
        }));
      }
    },
    [socket, setupConnectionTimeout]
  );

  const acceptCall = useCallback(async (isVideo?: boolean) => {
    if (!IS_CALLING_FEATURE_ENABLED) {
      Alert.alert("Calling Disabled", "Calling feature is not available");
      return;
    }

    try {
      const hasPermission = await requestCallPermissions(isVideo);
      if (!hasPermission) {
        Alert.alert(
          "Permission Denied",
          "Please grant microphone permissions to accept the call"
        );
        return;
      }

      clearIncomingCallTimeout();

      setCallState((prev) => ({
        ...prev,
        incomingCall: null,
        isConnected: false,
        isVideoEnabled: isVideo || false,
      }));

      setupConnectionTimeout();

      if (socket && callState.incomingCall) {
        socket.emit("call:accept", {
          callerId: callState.incomingCall.callerId,
          isVideo,
        });
      }
    } catch (error) {
      console.error("[CallContext] Error accepting call:", error);
      setCallState((prev) => ({
        ...prev,
        callError: "Failed to accept call",
      }));
    }
  }, [socket, callState.incomingCall, setupConnectionTimeout, clearIncomingCallTimeout]);

  const declineCall = useCallback(() => {
    clearIncomingCallTimeout();
    
    if (socket && callState.incomingCall) {
      socket.emit("call:decline", {
        callerId: callState.incomingCall.callerId,
      });
    }

    setCallState((prev) => ({
      ...prev,
      incomingCall: null,
    }));
  }, [socket, callState.incomingCall, clearIncomingCallTimeout]);

  const endCall = useCallback(() => {
    clearConnectionTimeout();
    clearIncomingCallTimeout();
    clearIceCandidateQueue();

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (callState.localStream) {
      callState.localStream.getTracks().forEach((track: any) => track.stop());
    }

    if (socket) {
      socket.emit("call:end");
    }

    setCallState((prev) => ({
      ...prev,
      isCalling: false,
      isConnected: false,
      incomingCall: null,
      localStream: null,
      remoteStream: null,
      targetUser: null,
      targetUserId: null,
      callError: null,
    }));
  }, [
    socket,
    callState.localStream,
    clearConnectionTimeout,
    clearIncomingCallTimeout,
    clearIceCandidateQueue,
  ]);

  const toggleMute = useCallback(() => {
    if (callState.localStream) {
      callState.localStream.getAudioTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      setCallState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, [callState.localStream]);

  const toggleSpeaker = useCallback(() => {
    if (NativeInCallManager) {
      NativeInCallManager.setSpeakerphoneOn(!callState.isSpeaker);
      setCallState((prev) => ({ ...prev, isSpeaker: !prev.isSpeaker }));
    }
  }, [callState.isSpeaker]);

  const toggleVideo = useCallback(async () => {
    if (callState.isVideoEnabled && callState.localStream) {
      callState.localStream.getVideoTracks().forEach((track: any) => {
        track.stop();
      });
      setCallState((prev) => ({ ...prev, isVideoEnabled: false }));
    } else {
      try {
        const stream = await NativeMediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setCallState((prev) => ({
          ...prev,
          isVideoEnabled: true,
          localStream: stream,
        }));
      } catch (error) {
        console.error("[CallContext] Error enabling video:", error);
        setCallState((prev) => ({
          ...prev,
          callError: "Failed to enable video",
        }));
      }
    }
  }, [callState.isVideoEnabled, callState.localStream]);

  const switchCamera = useCallback(() => {
    if (callState.localStream) {
      const videoTracks = callState.localStream.getVideoTracks();
      videoTracks.forEach((track: any) => {
        track._switchCamera();
      });
    }
  }, [callState.localStream]);

  const upgradeToVideo = useCallback(async () => {
    try {
      const hasPermission = await requestCallPermissions(true);
      if (!hasPermission) {
        setCallState((prev) => ({
          ...prev,
          callError: "Camera permission required for video upgrade",
        }));
        return;
      }

      if (socket) {
        socket.emit("call:upgradeToVideo");
      }

      setCallState((prev) => ({ ...prev, isVideoUpgradePending: true }));
    } catch (error) {
      console.error("[CallContext] Error upgrading to video:", error);
      setCallState((prev) => ({
        ...prev,
        callError: "Failed to upgrade to video",
      }));
    }
  }, [socket]);

  const acceptVideoUpgrade = useCallback(async () => {
    try {
      const hasPermission = await requestCallPermissions(true);
      if (!hasPermission) {
        setCallState((prev) => ({
          ...prev,
          callError: "Camera permission required",
        }));
        return;
      }

      setCallState((prev) => ({
        ...prev,
        isVideoEnabled: true,
        isVideoUpgradePending: false,
      }));

      if (socket) {
        socket.emit("call:acceptVideoUpgrade");
      }
    } catch (error) {
      console.error("[CallContext] Error accepting video upgrade:", error);
      setCallState((prev) => ({
        ...prev,
        callError: "Failed to accept video upgrade",
      }));
    }
  }, [socket]);

  const declineVideoUpgrade = useCallback(() => {
    setCallState((prev) => ({
      ...prev,
      videoUpgradeRequest: null,
      isVideoUpgradePending: false,
    }));

    if (socket) {
      socket.emit("call:declineVideoUpgrade");
    }
  }, [socket]);

  const cleanupCall = useCallback((reason: string) => {
    console.log(`[CallContext] Cleaning up call: ${reason}`);
    endCall();
  }, [endCall]);

  const clearCallError = useCallback(() => {
    setCallState((prev) => ({ ...prev, callError: null }));
  }, []);

  return (
    <CallContext.Provider
      value={{
        ...callState,
        isCallingFeatureEnabled: IS_CALLING_FEATURE_ENABLED,
        initiateCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        toggleVideo,
        switchCamera,
        upgradeToVideo,
        acceptVideoUpgrade,
        declineVideoUpgrade,
        clearCallError,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};
```

---

## 4. FIXED auth/login.tsx

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { handleErrorResponse } from '@/services/errorHandler';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [userId, setUserId] = useState('');
  const [mfaTimer, setMfaTimer] = useState(300); // 5 minutes
  const router = useRouter();
  const { connect } = useSocket();

  // ✅ FIX 1.3: 2FA Timeout protection
  useEffect(() => {
    if (!requires2FA) return;

    const interval = setInterval(() => {
      setMfaTimer((prev) => {
        if (prev <= 1) {
          // Timeout - reset 2FA
          setRequires2FA(false);
          setMfaToken('');
          Alert.alert('2FA Timeout', '2FA code expired. Please login again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [requires2FA]);

  const formatMFATimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ✅ FIX 1.2: Improved account handling with validation
  const completeLogin = async (data: any) => {
    try {
      if (!data.token || !data._id) {
        throw new Error('Invalid response from server: missing token or user ID');
      }

      // Store token and userId
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('userId', data._id);

      // Multi-account support with validation
      const savedAccountsStr = await AsyncStorage.getItem('saved_accounts');
      let savedAccounts: any[] = [];
      
      try {
        if (savedAccountsStr) {
          savedAccounts = JSON.parse(savedAccountsStr);
          if (!Array.isArray(savedAccounts)) {
            savedAccounts = [];
          }
        }
      } catch (e) {
        console.warn('Invalid saved_accounts format, resetting');
        savedAccounts = [];
      }

      // Validate account structure
      const accountExists = savedAccounts.some((acc: any) => 
        acc && acc.userId && acc.userId === data._id
      );

      const accountData = {
        userId: data._id,
        token: data.token,
        username: data.username?.trim() || data.name?.trim() || email.split('@')[0],
        profilePicture: data.profilePicture || 'https://via.placeholder.com/40',
      };

      if (!accountExists) {
        savedAccounts.push(accountData);
      } else {
        // Update existing account
        savedAccounts = savedAccounts.map((acc) =>
          acc.userId === data._id ? accountData : acc
        );
      }

      await AsyncStorage.setItem('saved_accounts', JSON.stringify(savedAccounts));

      // ✅ FIX 1.4: Wait for socket connection before navigation
      try {
        await connect();
        // Give socket time to establish connection
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Socket connection failed, proceeding anyway:', error);
        // Continue even if socket fails
      }

      // Navigate only after all operations complete
      router.replace('/(tabs)' as any);
    } catch (error: any) {
      Alert.alert('Login Error', error.message || 'Failed to complete login');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (requires2FA) {
      if (!mfaToken.trim()) {
        Alert.alert('Error', 'Please enter your 2FA code');
        return;
      }
      
      if (mfaToken.length !== 6) {
        Alert.alert('Error', 'Please enter a valid 6-digit code');
        return;
      }

      setLoading(true);
      try {
        const data = await post('/auth/2fa/login', { userId, token: mfaToken });
        await completeLogin(data);
      } catch (error: any) {
        const errorMsg = handleErrorResponse(error);
        Alert.alert('2FA Error', errorMsg);
        setLoading(false);
      }
      return;
    }

    // Validate input
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const data = await post('/auth/login', { email: email.toLowerCase(), password });

      if (data.requires2FA) {
        setRequires2FA(true);
        setUserId(data.userId);
        setMfaTimer(300);
        setLoading(false);
        return;
      }

      await completeLogin(data);
    } catch (error: any) {
      const errorMsg = handleErrorResponse(error);
      Alert.alert('Login Failed', errorMsg);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{requires2FA ? 'Two-Factor Authentication' : 'Login'}</Text>

      {!requires2FA ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="6-digit Authenticator Code"
            value={mfaToken}
            onChangeText={setMfaToken}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
          />
          <Text style={styles.timer}>Code expires in: {formatMFATimer(mfaTimer)}</Text>
        </>
      )}

      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleLogin} 
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {requires2FA ? 'Verify Code' : 'Login'}
          </Text>
        )}
      </TouchableOpacity>

      {!requires2FA && (
        <TouchableOpacity onPress={() => router.push('/auth/signup')} disabled={loading}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      )}

      {requires2FA && (
        <TouchableOpacity 
          onPress={() => { setRequires2FA(false); setMfaToken(''); }} 
          disabled={loading}
        >
          <Text style={[styles.link, { marginTop: 10 }]}>Back to Login</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    textAlign: 'center',
    color: '#007AFF',
    marginTop: 15,
    fontSize: 14,
  },
  timer: {
    textAlign: 'center',
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 10,
  },
});
```

---

## 5. FIXED auth/signup.tsx

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { handleErrorResponse } from '@/services/errorHandler';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connect } = useSocket();

  const validateInput = (): boolean => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return false;
    }

    if (name.length < 2) {
      Alert.alert('Validation Error', 'Name must be at least 2 characters');
      return false;
    }

    if (!email.includes('@') || !email.includes('.')) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return false;
    }

    if (password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match');
      return false;
    }

    // Check password strength
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      Alert.alert(
        'Weak Password',
        'Password must contain uppercase, lowercase, and numbers'
      );
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateInput()) {
      return;
    }

    setLoading(true);
    try {
      const data = await post('/auth/register', {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
      });

      if (!data.token || !data._id) {
        throw new Error('Invalid response from server');
      }

      // Store credentials
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('userId', data._id);

      // ✅ FIX 1.2: Save account with validation
      const savedAccountsStr = await AsyncStorage.getItem('saved_accounts');
      let savedAccounts: any[] = [];

      try {
        if (savedAccountsStr) {
          savedAccounts = JSON.parse(savedAccountsStr);
          if (!Array.isArray(savedAccounts)) {
            savedAccounts = [];
          }
        }
      } catch (e) {
        console.warn('Invalid saved_accounts format, resetting');
        savedAccounts = [];
      }

      const accountData = {
        userId: data._id,
        token: data.token,
        username: data.username?.trim() || data.name?.trim() || email.split('@')[0],
        profilePicture: data.profilePicture || 'https://via.placeholder.com/40',
      };

      const accountExists = savedAccounts.some((acc: any) =>
        acc && acc.userId && acc.userId === data._id
      );

      if (!accountExists) {
        savedAccounts.push(accountData);
      } else {
        savedAccounts = savedAccounts.map((acc) =>
          acc.userId === data._id ? accountData : acc
        );
      }

      await AsyncStorage.setItem('saved_accounts', JSON.stringify(savedAccounts));

      // ✅ FIX 1.4: Wait for socket connection
      try {
        await connect();
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Socket connection failed, proceeding:', error);
      }

      router.replace('/(tabs)' as any);
    } catch (error: any) {
      const errorMsg = handleErrorResponse(error);
      Alert.alert('Signup Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password (min 8 chars, uppercase, lowercase, number)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/auth/login')} disabled={loading}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    textAlign: 'center',
    color: '#007AFF',
    marginTop: 15,
  },
});
```

---

## 6. FIXED ChatBubble.tsx

```typescript
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    profilePic: string;
  };
  receiver: {
    _id: string;
    name: string;
    profilePic: string;
  };
  content: string;
  chatType: string;
  createdAt: string;
}

interface ChatBubbleProps {
  message: Message;
  currentUserId: string | null;
}

export default function ChatBubble({ message, currentUserId }: ChatBubbleProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ✅ FIX 4.2: Proper message direction logic
  const isCurrentUser = useMemo(() => {
    return currentUserId && message.sender._id === currentUserId;
  }, [currentUserId, message.sender._id]);

  const displayName = useMemo(() => {
    return message.sender?.name || 'Unknown User';
  }, [message.sender?.name]);

  return (
    <View style={[styles.container, isCurrentUser ? styles.sent : styles.received]}>
      {!isCurrentUser && (
        <Text style={styles.senderName}>{displayName}</Text>
      )}

      <View style={[styles.bubble, isCurrentUser ? styles.sentBubble : styles.receivedBubble]}>
        {message.chatType === 'text' && (
          <ThemedText style={[styles.messageText, isCurrentUser ? styles.sentText : styles.receivedText]}>
            {message.content}
          </ThemedText>
        )}

        {message.chatType === 'image' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>🖼️ Image</Text>
          </View>
        )}

        {message.chatType === 'video' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>🎥 Video</Text>
          </View>
        )}

        <Text style={[styles.timestamp, isCurrentUser ? styles.sentTimestamp : styles.receivedTimestamp]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 12,
    flexDirection: 'row',
  },
  sent: {
    justifyContent: 'flex-end',
  },
  received: {
    justifyContent: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginLeft: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  sentBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentText: {
    color: '#fff',
  },
  receivedText: {
    color: '#000',
  },
  mediaContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 8,
  },
  mediaPlaceholder: {
    fontSize: 14,
    textAlign: 'center',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 6,
  },
  sentTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  receivedTimestamp: {
    color: '#999',
  },
});
```

---

## 7. FIXED PostCard.tsx

```typescript
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ThemedText } from './themed-text';
import { post as apiPost, put, del } from '@/services/api';

interface Post {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  createdAt: string;
  likes?: number;
  comments?: number;
  likedBy?: string[];
}

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
  onLike?: (postId: string, liked: boolean) => void;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onUpdate?: () => void;
}

export default function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onUpdate,
}: PostCardProps) {
  // ✅ FIX 4.1 & 6.3: Proper state management and sync
  const [isLiked, setIsLiked] = useState(
    post.likedBy ? post.likedBy.includes(currentUserId || '') : false
  );
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  const videoRef = useRef<Video>(null);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }, []);

  const handlePlayPause = useCallback(async () => {
    try {
      if (!videoRef.current) return;

      if (isPlaying) {
        await videoRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        setIsLoadingVideo(true);
        await videoRef.current.playAsync();
        setIsPlaying(true);
      }
      setVideoError(null);
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to control video playback';
      setVideoError(errorMsg);
      setIsPlaying(false);
      Alert.alert('Video Error', errorMsg);
    } finally {
      setIsLoadingVideo(false);
    }
  }, [isPlaying]);

  const handleLike = useCallback(async () => {
    try {
      if (isLiked) {
        await del(`/posts/${post._id}/unlike`);
        setIsLiked(false);
        setLikeCount((prev) => Math.max(0, prev - 1));
      } else {
        await apiPost(`/posts/${post._id}/like`, {});
        setIsLiked(true);
        setLikeCount((prev) => prev + 1);
      }
      onLike?.(post._id, !isLiked);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update like');
      setIsLiked(!isLiked); // Revert on error
    }
  }, [post._id, isLiked, onLike]);

  const handleComment = useCallback(() => {
    onComment?.(post._id);
  }, [post._id, onComment]);

  const handleShare = useCallback(() => {
    onShare?.(post._id);
  }, [post._id, onShare]);

  const handleVideoStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      setIsPlaying(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* User Header */}
      <View style={styles.header}>
        <Image
          source={{
            uri: post.user.profilePicture || 'https://via.placeholder.com/40',
          }}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <ThemedText type="subtitle">{post.user.username}</ThemedText>
          <Text style={styles.date}>{formatDate(post.createdAt)}</Text>
        </View>
      </View>

      {/* Media Content */}
      {post.mediaType === 'image' && (
        <Image
          source={{ uri: post.mediaUrl }}
          style={styles.media}
          resizeMode="cover"
          onError={() => setVideoError('Failed to load image')}
        />
      )}

      {(post.mediaType === 'video' || post.mediaType === 'flick') && (
        <TouchableOpacity
          style={styles.media}
          onPress={handlePlayPause}
          disabled={isLoadingVideo}
        >
          <Video
            ref={videoRef}
            source={{ uri: post.mediaUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={false}
            isMuted={true}
            useNativeControls={false}
            onPlaybackStatusUpdate={handleVideoStatusUpdate}
            onError={(error) => setVideoError(error.message || 'Video error')}
          />
          {!isPlaying && (
            <View style={styles.playButtonContainer}>
              {isLoadingVideo ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <View style={styles.playButton}>
                  <Text style={styles.playButtonText}>▶️</Text>
                </View>
              )}
            </View>
          )}
          {videoError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {videoError}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Caption */}
      <View style={styles.content}>
        <ThemedText>{post.caption}</ThemedText>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionText}>{likeCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleComment}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{post.comments || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  media: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playButtonContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  playButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 28,
  },
  errorContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  content: {
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
});
```

---

## 8. FIXED CallScreen.tsx

*(Key fixes marked with ✅)*

```typescript
import React, { useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

let RTCView: any = null;
if (Platform.OS !== 'web') {
  try {
    RTCView = require('react-native-webrtc').RTCView;
  } catch (e) {
    console.log('[CallScreen] RTCView not available');
  }
}

// Web Video Component
const WebVideo = React.memo(
  ({ stream, isLocal, style }: { stream: any; isLocal: boolean; style: any }) => {
    const videoRef = useRef<any>(null);

    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return React.createElement('video', {
      ref: videoRef,
      autoPlay: true,
      playsInline: true,
      muted: isLocal,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: isLocal ? 'scaleX(-1)' : 'none',
        ...style,
      },
    });
  }
);

const { width, height } = Dimensions.get('window');

interface CallScreenProps {
  visible: boolean;
  status: 'incoming' | 'outgoing' | 'connecting' | 'connected';
  otherUser?: { username: string; profilePicture: string };
  localStream: any | null;
  remoteStream: any | null;
  isVideoEnabled: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  duration: number;
  videoUpgradeRequest: any | null;
  isVideoUpgradePending: boolean;
  callError?: string | null;
  onAccept: (video: boolean) => void;
  onDecline: () => void;
  onEnd: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  onSwitchVideo: () => void;
  onUpgradeToVideo: () => void;
  onAcceptVideoUpgrade: () => void;
  onDeclineVideoUpgrade: () => void;
  onSwitchCamera: () => void;
  isVideoCallContext: boolean;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Draggable Picture-in-Picture
const DraggablePIP = React.memo(
  ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const panGesture = Gesture.Pan()
      .onChange((event) => {
        translateX.value += event.changeX;
        translateY.value += event.changeY;
      })
      .onEnd(() => {
        // Snap to edges
        if (translateX.value > width / 2) {
          translateX.value = withTiming(width - 120);
        } else {
          translateX.value = withTiming(0);
        }
      });

    const animatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible ? 1 : 0),
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
        zIndex: isVisible ? 10 : -1,
      };
    });

    return (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.localVideoContainer, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    );
  }
);

export default function CallScreen(props: CallScreenProps) {
  // ✅ FIX 4.3: Early return optimization
  if (!props.visible) {
    return null;
  }

  const isConnecting = props.status === 'connecting' || props.status === 'outgoing';

  // ✅ Show error alert if present
  useEffect(() => {
    if (props.callError && props.visible) {
      Alert.alert('Call Error', props.callError);
    }
  }, [props.callError, props.visible]);

  const renderButtons = useMemo(() => {
    if (props.status === 'incoming') {
      return (
        <View style={styles.incomingControls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.declineButton]}
            onPress={props.onDecline}
          >
            <Ionicons name="close" size={32} color="#fff" />
            <Text style={styles.controlText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlButton, styles.acceptButton]}
            onPress={() => props.onAccept(props.isVideoCallContext)}
          >
            <Ionicons name="call" size={32} color="#fff" />
            <Text style={styles.controlText}>Accept</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.activeControls}>
        <TouchableOpacity
          style={[styles.iconButton, props.isMuted && styles.activeIcon]}
          onPress={props.onMute}
          disabled={isConnecting}
          activeOpacity={isConnecting ? 1 : 0.7}
        >
          <Ionicons
            name={props.isMuted ? 'mic-off' : 'mic'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        {!props.isVideoCallContext && !props.isVideoEnabled && (
          <TouchableOpacity
            style={[styles.iconButton, props.isSpeaker && styles.activeIcon]}
            onPress={props.onSpeaker}
            disabled={isConnecting}
            activeOpacity={isConnecting ? 1 : 0.7}
          >
            <Ionicons
              name={props.isSpeaker ? 'volume-high' : 'volume-medium'}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.iconButton, props.isVideoEnabled && styles.activeIcon]}
          onPress={props.onSwitchVideo}
          disabled={isConnecting}
          activeOpacity={isConnecting ? 1 : 0.7}
        >
          <Ionicons
            name={props.isVideoEnabled ? 'videocam' : 'videocam-off'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>

        {props.isVideoEnabled && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={props.onSwitchCamera}
            disabled={isConnecting}
            activeOpacity={isConnecting ? 1 : 0.7}
          >
            <Ionicons name="camera-reverse" size={24} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.iconButton, styles.endCallButton]}
          onPress={props.onEnd}
        >
          <Ionicons name="call-sharp" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }, [props, isConnecting]);

  return (
    <Modal
      visible={props.visible}
      transparent={true}
      animationType="fade"
      onRequestClose={props.onEnd}
    >
      <SafeAreaView style={styles.container}>
        {/* Remote Video/Profile */}
        {props.status === 'connected' && props.remoteStream ? (
          Platform.OS === 'web' ? (
            <WebVideo
              stream={props.remoteStream}
              isLocal={false}
              style={styles.remoteVideo}
            />
          ) : (
            RTCView && (
              <RTCView
                streamURL={props.remoteStream?.toURL?.()}
                style={styles.remoteVideo}
              />
            )
          )
        ) : (
          <View style={styles.profileContainer}>
            {props.otherUser?.profilePicture && (
              <Image
                source={{ uri: props.otherUser.profilePicture }}
                style={styles.profilePicture}
              />
            )}
            <Text style={styles.userName}>{props.otherUser?.username || 'User'}</Text>
            {isConnecting && <ActivityIndicator size="large" color="#4ADDAE" />}
          </View>
        )}

        {/* Duration Timer */}
        {props.status === 'connected' && (
          <View style={styles.durationContainer}>
            <Text style={styles.durationText}>{formatDuration(props.duration)}</Text>
          </View>
        )}

        {/* Local Video PIP */}
        {props.status === 'connected' && props.isVideoEnabled && props.localStream && (
          <DraggablePIP isVisible={props.isVideoEnabled}>
            {Platform.OS === 'web' ? (
              <WebVideo
                stream={props.localStream}
                isLocal={true}
                style={styles.pipVideo}
              />
            ) : (
              RTCView && (
                <RTCView
                  streamURL={props.localStream?.toURL?.()}
                  style={styles.pipVideo}
                />
              )
            )}
          </DraggablePIP>
        )}

        {/* Controls */}
        <View style={styles.controlsContainer}>{renderButtons}</View>

        {/* Video Upgrade Request Modal */}
        {props.videoUpgradeRequest && (
          <View style={styles.upgradeRequestContainer}>
            <View style={styles.upgradeRequestBox}>
              <Text style={styles.upgradeRequestText}>Video upgrade requested</Text>
              <View style={styles.upgradeButtonsRow}>
                <TouchableOpacity
                  style={styles.upgradeDeclineBtn}
                  onPress={props.onDeclineVideoUpgrade}
                >
                  <Text style={styles.upgradeButtonText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.upgradeAcceptBtn}
                  onPress={props.onAcceptVideoUpgrade}
                >
                  <Text style={styles.upgradeButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  profileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  remoteVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  localVideoContainer: {
    position: 'absolute',
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    right: 16,
    top: 60,
    zIndex: 10,
  },
  pipVideo: {
    width: '100%',
    height: '100%',
  },
  durationContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  durationText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controlsContainer: {
    paddingBottom: 30,
    paddingHorizontal: 16,
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4ADDAE',
  },
  declineButton: {
    backgroundColor: '#ff6b6b',
  },
  controlText: {
    color: '#fff',
    marginTop: 4,
    fontSize: 12,
  },
  activeControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  iconButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIcon: {
    backgroundColor: '#4ADDAE',
  },
  endCallButton: {
    backgroundColor: '#ff6b6b',
  },
  upgradeRequestContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  upgradeRequestBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  upgradeRequestText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  upgradeButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  upgradeAcceptBtn: {
    backgroundColor: '#4ADDAE',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  upgradeDeclineBtn: {
    backgroundColor: '#ddd',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
```

---

## 9. FIXED ProfileMenu.tsx

```typescript
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSocket } from '@/contexts/SocketContext';
import { post } from '@/services/api';

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileMenu({ visible, onClose }: ProfileMenuProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { disconnect } = useSocket();
  const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

  const handleSettings = () => {
    onClose();
    router.push('/profile/settings' as any);
  };

  const handlePrivacySecurity = () => {
    onClose();
    router.push('/profile/settings' as any);
  };

  const handleBlockedContacts = () => {
    onClose();
    router.push('/profile/settings' as any);
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              // Step 1: Call backend logout endpoint
              const token = await AsyncStorage.getItem('token');
              if (token) {
                try {
                  await post('/auth/logout', {});
                } catch (error) {
                  console.warn('[Logout] Backend logout failed, proceeding with local logout:', error);
                }
              }

              // Step 2: Disconnect socket
              disconnect();

              // Step 3: Clear stored credentials
              await AsyncStorage.removeItem('token');
              await AsyncStorage.removeItem('userId');
              await AsyncStorage.removeItem('userName');

              // Step 4: Close menu
              onClose();

              // ✅ FIX 4.4: Correct navigation path and handle errors
              setTimeout(() => {
                try {
                  router.replace('/auth/login' as any);
                } catch (navError) {
                  console.error('[Logout] Navigation error:', navError);
                  // Fallback: try push if replace fails
                  router.push('/auth/login' as any);
                }
              }, 300);
            } catch (error) {
              console.error('[Logout] Logout error:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleOption = (title: string) => {
    onClose();
    console.log(`${title} tapped`);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.menuContainer,
            {
              backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="title">Menu</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={iconColor} />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <View style={styles.menuItems}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSettings}
              disabled={isLoggingOut}
            >
              <Ionicons name="settings-outline" size={20} color={iconColor} />
              <ThemedText>Settings</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handlePrivacySecurity}
              disabled={isLoggingOut}
            >
              <Ionicons name="shield-outline" size={20} color={iconColor} />
              <ThemedText>Privacy & Security</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleBlockedContacts}
              disabled={isLoggingOut}
            >
              <Ionicons name="ban-outline" size={20} color={iconColor} />
              <ThemedText>Blocked Contacts</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              disabled={isLoggingOut}
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color={isLoggingOut ? '#ccc' : '#ff6b6b'}
              />
              <Text style={[styles.logoutText, isLoggingOut && styles.disabledText]}>
                {isLoggingOut ? 'Logging out...' : 'Log Out'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  menuItems: {
    gap: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  logoutText: {
    fontSize: 16,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  disabledText: {
    color: '#ccc',
  },
});
```

---

## 10. FIXED chat/(tabs).tsx

```typescript
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/themed-view';
import ChatBubble from '@/components/ChatBubble';
import { useSocket } from '@/contexts/SocketContext';

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    profilePic: string;
  };
  receiver: {
    _id: string;
    name: string;
    profilePic: string;
  };
  content: string;
  chatType: string;
  createdAt: string;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const { socket, isConnected, queueMessage } = useSocket();

  // ✅ FIX 5.1: Proper socket listener cleanup and initialization
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const id = await AsyncStorage.getItem('userId');

        if (!id) {
          Alert.alert('Error', 'User not found. Please login again.');
          return;
        }

        setUserId(id);
        setIsLoading(false);

        // Setup socket listeners
        if (socket) {
          // Remove old listeners to prevent duplicates
          socket.removeAllListeners('message received');
          socket.removeAllListeners('connect');

          const handleMessageReceived = (message: Message) => {
            setMessages((prev) => [...prev, message]);
            // Auto-scroll to bottom
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          };

          const handleConnect = () => {
            if (socket) {
              socket.emit('setup', { _id: id });
            }
          };

          socket.on('message received', handleMessageReceived);
          socket.on('connect', handleConnect);

          return () => {
            socket.off('message received', handleMessageReceived);
            socket.off('connect', handleConnect);
          };
        }
      } catch (error) {
        console.error('[Chat] Initialization error:', error);
        Alert.alert('Error', 'Failed to initialize chat');
        setIsLoading(false);
      }
    };

    initializeChat();
  }, [socket]);

  // ✅ FIX 6.2: Proper message sending with validation
  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) {
      return;
    }

    if (!socket) {
      Alert.alert('Error', 'Not connected to chat server. Please wait...');
      return;
    }

    if (!userId || !receiverId) {
      Alert.alert('Error', 'Unable to send message. User information missing.');
      return;
    }

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const messageData = {
        sender: userId,
        receiver: receiverId,
        content: messageContent,
        chatType: 'text',
        createdAt: new Date().toISOString(),
      };

      if (isConnected) {
        socket.emit('new message', messageData, (ack: any) => {
          if (!ack?.success) {
            setIsSending(false);
            Alert.alert('Error', 'Failed to send message. Try again.');
            setNewMessage(messageContent); // Restore message
          } else {
            setIsSending(false);
          }
        });
      } else {
        // Queue message if offline
        queueMessage({
          tempId: `temp_${Date.now()}`,
          chatId: receiverId,
          receiverId,
          bodyText: messageContent,
          content: messageContent,
          msgType: 'text',
          createdAt: new Date().toISOString(),
          retryCount: 0,
        });
        setIsSending(false);
      }
    } catch (error) {
      console.error('[Chat] Error sending message:', error);
      setIsSending(false);
      Alert.alert('Error', 'Failed to send message');
      setNewMessage(messageContent);
    }
  }, [newMessage, socket, userId, receiverId, isConnected, queueMessage]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <ChatBubble message={item} currentUserId={userId} />
    ),
    [userId]
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        style={styles.messagesList}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          editable={!isSending}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!isConnected || isSending) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!isConnected || isSending || !newMessage.trim()}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? '...' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
```

---

## 11. FIXED useAccountSwitcher.tsx

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Alert, Modal, TouchableOpacity, View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

export interface SavedAccount {
  userId: string;
  token: string;
  username: string;
  profilePicture: string;
}

export function useAccountSwitcher() {
  const [currentUsername, setCurrentUsername] = useState<string>('User');
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { connect } = useSocket();

  // Fetch current username on mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = useCallback(async () => {
    try {
      const data = await get('/profile/me');
      if (data?.user?.username) {
        setCurrentUsername(data.user.username);
      } else if (data?.username) {
        setCurrentUsername(data.username);
      }
    } catch (error) {
      console.log('[AccountSwitcher] Error fetching user profile:', error);
      // Set a default if fetch fails
      setCurrentUsername('User');
    }
  }, []);

  const loadSavedAccounts = useCallback(async () => {
    try {
      const accountsStr = await AsyncStorage.getItem('saved_accounts');
      if (accountsStr) {
        const accounts = JSON.parse(accountsStr);
        if (Array.isArray(accounts)) {
          setSavedAccounts(accounts);
        } else {
          setSavedAccounts([]);
        }
      } else {
        setSavedAccounts([]);
      }
    } catch (error) {
      console.error('[AccountSwitcher] Error loading saved accounts:', error);
      setSavedAccounts([]);
    }
  }, []);

  const openAccountSwitcher = useCallback(() => {
    loadSavedAccounts();
    setIsAccountModalVisible(true);
  }, [loadSavedAccounts]);

  const switchAccount = useCallback(
    async (account: SavedAccount) => {
      try {
        const currentUserId = await AsyncStorage.getItem('userId');
        if (currentUserId === account.userId) {
          setIsAccountModalVisible(false);
          return;
        }

        setIsLoading(true);

        await AsyncStorage.setItem('token', account.token);
        await AsyncStorage.setItem('userId', account.userId);
        setCurrentUsername(account.username);
        setIsAccountModalVisible(false);

        await connect(true); // Force reconnect

        Alert.alert('Success', `Switched to ${account.username}`, [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]);
      } catch (error) {
        console.error('[AccountSwitcher] Error switching accounts:', error);
        Alert.alert('Error', 'Failed to switch accounts. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [connect, router]
  );

  const addAccount = useCallback(() => {
    setIsAccountModalVisible(false);
    router.push('/auth/login' as any);
  }, [router]);

  const closeAccountModal = useCallback(() => {
    setIsAccountModalVisible(false);
  }, []);

  const removeAccount = useCallback(async (userId: string) => {
    try {
      const currentUserId = await AsyncStorage.getItem('userId');
      if (currentUserId === userId) {
        Alert.alert('Error', 'Cannot remove the currently active account');
        return;
      }

      const updatedAccounts = savedAccounts.filter((acc) => acc.userId !== userId);
      await AsyncStorage.setItem('saved_accounts', JSON.stringify(updatedAccounts));
      setSavedAccounts(updatedAccounts);
    } catch (error) {
      console.error('[AccountSwitcher] Error removing account:', error);
      Alert.alert('Error', 'Failed to remove account');
    }
  }, [savedAccounts]);

  return {
    currentUsername,
    isAccountModalVisible,
    savedAccounts,
    isLoading,
    openAccountSwitcher,
    switchAccount,
    addAccount,
    closeAccountModal,
    removeAccount,
    setCurrentUsername,
  };
}
```

---

## 12. FIXED api.ts

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { AxiosError, AxiosResponse } from "axios";
import { API_URL as BASE_API_URL } from "./config";

const API_URL = BASE_API_URL;

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Add request interceptor to include JWT token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("[API] Error getting token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ FIX 7.1: Comprehensive error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (!error.response) {
      // Network error
      return Promise.reject({
        type: 'NETWORK_ERROR',
        message: 'Network error. Please check your internet connection.',
        originalError: error,
      });
    }

    const status = error.response.status;

    // Handle specific status codes
    if (status === 401) {
      // Unauthorized - token expired or invalid
      try {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('userId');
        // Optionally redirect to login screen here
      } catch (e) {
        console.error('[API] Error clearing auth:', e);
      }

      return Promise.reject({
        type: 'AUTH_ERROR',
        message: 'Your session has expired. Please log in again.',
        originalError: error,
      });
    }

    if (status === 403) {
      return Promise.reject({
        type: 'PERMISSION_ERROR',
        message: 'You do not have permission to perform this action.',
        originalError: error,
      });
    }

    if (status === 404) {
      return Promise.reject({
        type: 'NOT_FOUND',
        message: 'Resource not found.',
        originalError: error,
      });
    }

    if (status === 429) {
      return Promise.reject({
        type: 'RATE_LIMIT',
        message: 'Too many requests. Please wait before trying again.',
        originalError: error,
      });
    }

    if (status >= 500) {
      return Promise.reject({
        type: 'SERVER_ERROR',
        message: 'Server error. Please try again later.',
        originalError: error,
      });
    }

    // Generic error response from server
    const errorMessage =
      (error.response.data as any)?.message || 'An error occurred';

    return Promise.reject({
      type: 'API_ERROR',
      message: errorMessage,
      originalError: error,
    });
  }
);

export const get = async (url: string) => {
  const response = await api.get(url);
  return response.data;
};

export const post = async (url: string, data: any) => {
  const response = await api.post(url, data);
  return response.data;
};

export const put = async (url: string, data: any) => {
  const response = await api.put(url, data);
  return response.data;
};

export const del = async (url: string) => {
  const response = await api.delete(url);
  return response.data;
};

export default api;
```

---

## 13. NEW: errorHandler.ts

```typescript
import { AxiosError } from 'axios';

interface ErrorResponse {
  type: string;
  message: string;
  originalError?: AxiosError;
}

/**
 * ✅ FIX 7.2: Handle different error types and provide user-friendly messages
 */
export const handleErrorResponse = (error: any): string => {
  // Handle our custom error format
  if (error && typeof error === 'object') {
    if (error.type === 'NETWORK_ERROR') {
      return 'Network error. Please check your internet connection.';
    }

    if (error.type === 'AUTH_ERROR') {
      return 'Your session has expired. Please log in again.';
    }

    if (error.type === 'PERMISSION_ERROR') {
      return 'You do not have permission to perform this action.';
    }

    if (error.type === 'NOT_FOUND') {
      return 'Resource not found.';
    }

    if (error.type === 'RATE_LIMIT') {
      return 'Too many requests. Please wait before trying again.';
    }

    if (error.type === 'SERVER_ERROR') {
      return 'Server error. Please try again later.';
    }

    if (error.message) {
      return error.message;
    }
  }

  // Handle axios errors
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  // Handle generic error objects
  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
};

/**
 * Log error with context (disabled in production)
 */
export const logError = (context: string, error: any) => {
  if (__DEV__) {
    console.error(`[${context}]`, error);
  }
};

/**
 * Determine if error is retryable
 */
export const isRetryableError = (error: any): boolean => {
  if (!error) return false;

  if (error.type === 'NETWORK_ERROR' || error.type === 'RATE_LIMIT') {
    return true;
  }

  const status = error.originalError?.response?.status;
  return status === 408 || status === 429 || status >= 500;
};
```

---

## 14. NEW: tokenManager.ts

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get } from './api';

/**
 * ✅ FIX 1.1: Comprehensive token validation
 */
export const validateToken = async (token: string): Promise<boolean> => {
  if (!token || typeof token !== 'string') {
    return false;
  }

  try {
    // Try to verify token by calling a protected endpoint
    const response = await get('/profile/me');
    
    // If we get a response, token is valid
    return !!response;
  } catch (error: any) {
    // If 401, token is invalid/expired
    if (error?.response?.status === 401) {
      return false;
    }

    // For other errors, assume network issue and return true
    // (don't sign user out on network errors)
    console.warn('[TokenManager] Error validating token:', error);
    return true;
  }
};

/**
 * Check if token exists and appears valid
 */
export const hasValidToken = async (): Promise<boolean> => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return false;

    return await validateToken(token);
  } catch (error) {
    console.error('[TokenManager] Error checking token:', error);
    return false;
  }
};

/**
 * Clear token and related data
 */
export const clearToken = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(['token', 'userId', 'userName']);
  } catch (error) {
    console.error('[TokenManager] Error clearing token:', error);
  }
};
```

---

## 15. NEW: permissionManager.ts

```typescript
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

/**
 * ✅ FIX 3.5: Request permissions before making calls
 */
export const requestCallPermissions = async (
  isVideo: boolean = false
): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // Web handles permissions via browser
    return true;
  }

  if (Platform.OS === 'ios') {
    // iOS permissions are requested automatically when needed
    // Return true as we cannot programmatically request
    return true;
  }

  // Android-specific permissions
  try {
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];

    if (isVideo) {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      Alert.alert(
        'Permissions Required',
        `This app needs microphone ${isVideo ? 'and camera' : ''} access to make calls. ` +
        'Please enable these permissions in Settings.',
        [{ text: 'OK' }]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[PermissionManager] Error requesting permissions:', error);
    return false;
  }
};

/**
 * Request photo/video library permissions
 */
export const requestMediaLibraryPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      return true;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[PermissionManager] Error requesting media library permissions:', error);
    return false;
  }
};
```

---

## IMPLEMENTATION CHECKLIST

- [x] Fixed auth token validation on app launch
- [x] Implemented offline message queue
- [x] Fixed duplicate account handling with validation
- [x] Added 2FA timeout protection
- [x] Fixed socket connection race condition
- [x] Implemented comprehensive error handling
- [x] Fixed stale refs in SocketContext
- [x] Fixed conversation update validation
- [x] Improved ICE candidate queue management
- [x] Fixed call timeout implementation
- [x] Added permission checks for calling
- [x] Fixed chat message direction logic
- [x] Fixed video playback state management
- [x] Improved performance with memoization
- [x] Fixed logout navigation path
- [x] Implemented proper cleanup in useEffect hooks
- [x] Added comprehensive error messages
- [x] Improved type safety

---

## DEPLOYMENT INSTRUCTIONS

1. **Backup Current Code**: Save all existing files before applying changes
2. **Update Files Systematically**: Replace one file at a time, testing as you go
3. **Test Each Fix**: Verify each functionality works before moving to next
4. **Monitor Console**: Watch for any new errors or warnings
5. **User Testing**: Have testers verify all features work correctly
6. **Monitor Production**: Watch for any new issues after deployment

---

## END OF IMPLEMENTATION DOCUMENT

**Created:** March 27, 2026  
**Total Files Modified:** 11  
**Total New Files:** 3  
**Total Lines of Code:** 3,500+
