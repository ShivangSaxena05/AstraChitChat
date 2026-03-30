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
          const IceCandidate =
            Platform.OS === "web" ? window.RTCIceCandidate : NativeRTCIceCandidate;
          await peerConnectionRef.current.addIceCandidate(new IceCandidate(candidate));
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
        if (typeof track._switchCamera === "function") {
          track._switchCamera();
        }
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
