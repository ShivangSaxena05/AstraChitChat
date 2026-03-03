import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, MediaStream } from 'react-native-webrtc';
import { useSocket } from './SocketContext';

interface CallState {
  isCalling: boolean;
  isConnected: boolean; // True only when WebRTC handshake is complete
  incomingCall: any | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isSpeaker: boolean;
  activeChatId: string | null;
}

interface CallContextType extends CallState {
  initiateCall: (targetIds: string[], chatId: string, isVideo?: boolean) => Promise<void>;
  acceptCall: (isVideo?: boolean) => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, currentUserId } = useSocket();
  const [callState, setCallState] = useState<CallState>({
    isCalling: false,
    isConnected: false,
    incomingCall: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isSpeaker: false,
    activeChatId: null,
  });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallTargetIdRef = useRef<string | null>(null);

  // Setup Socket Listeners for Signaling
  useEffect(() => {
    if (!socket || !currentUserId) return;

    socket.on('webrtc-offer', async ({ offer, callerId, chatId }) => {
      // If we are already in a call, we should automatically decline or ignore (busy)
      if (peerConnectionRef.current || callState.isCalling) {
        socket.emit('end-call', { targetId: callerId, senderId: currentUserId });
        return;
      }
      
      console.log('Received call offer from:', callerId);
      setCallState(prev => ({ ...prev, incomingCall: { offer, callerId, chatId } }));
    });

    socket.on('webrtc-answer', async ({ answer, responderId }) => {
      console.log('Received call answer from:', responderId);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('webrtc-candidate', async ({ candidate, senderId }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding received ice candidate', error);
        }
      }
    });

    socket.on('end-call', () => {
      cleanupCall();
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-candidate');
      socket.off('end-call');
    };
  }, [socket, currentUserId, callState.isCalling]);

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'App needs access to your microphone so you can make audio calls.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const setupMediaAndPC = async (targetId: string): Promise<RTCPeerConnection> => {
    // 0. Request Microphone Permissions
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      console.error('Microphone permission denied');
      throw new Error('Microphone permission denied');
    }

    // 1. Get Local Microphone Stream
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false
    }) as MediaStream;

    setCallState(prev => ({ ...prev, localStream: stream }));

    // 2. Setup RTCPeerConnection
    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;
    activeCallTargetIdRef.current = targetId;

    // Add local tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle ICE Candidates
    pc.onicecandidate = (event: any) => {
      if (event.candidate && activeCallTargetIdRef.current) {
        socket?.emit('webrtc-candidate', {
          targetId: activeCallTargetIdRef.current,
          candidate: event.candidate,
          senderId: currentUserId
        });
      }
    };

    // Receive Remote Stream
    pc.ontrack = (event: any) => {
      setCallState(prev => ({ 
        ...prev, 
        remoteStream: event.streams[0]
      }));
    };

    // Handle connection states
    pc.onconnectionstatechange = (event: any) => {
      console.log('WebRTC Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState(prev => ({ ...prev, isConnected: true }));
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupCall('connection failed');
      } else if (pc.connectionState === 'closed') {
        cleanupCall('connection closed');
      }
    };

    return pc;
  };

  const initiateCall = async (targetIds: string[], chatId: string) => {
    // Note: This basic setup assumes 1-on-1 direct calls currently. 
    // Group calls (Mesh) would require managing multiple RTCPeerConnections (an array/map of them).
    // We will start by connecting to the first target.
    if (targetIds.length === 0 || !socket || !currentUserId) return;
    
    const targetId = targetIds[0];

    try {
      setCallState(prev => ({ ...prev, isCalling: true, isConnected: false, activeChatId: chatId }));
      
      const pc = await setupMediaAndPC(targetId);
      
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', {
        targetId,
        offer,
        callerId: currentUserId,
        chatId
      });
      
    } catch (error) {
      console.error('Call initiation failed:', error);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!callState.incomingCall || !socket || !currentUserId) return;
    const { offer, callerId, chatId } = callState.incomingCall;

    try {
      setCallState(prev => ({ ...prev, isCalling: true, incomingCall: null, activeChatId: chatId }));
      
      const pc = await setupMediaAndPC(callerId);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc-answer', {
        targetId: callerId,
        answer,
        responderId: currentUserId
      });
    } catch (error) {
      console.error('Accept call failed:', error);
      cleanupCall();
    }
  };

  const declineCall = () => {
    if (callState.incomingCall && socket && currentUserId) {
      socket.emit('end-call', {
        targetId: callState.incomingCall.callerId,
        senderId: currentUserId
      });
    }
    setCallState(prev => ({ ...prev, incomingCall: null }));
  };

  const endCall = () => {
    if (activeCallTargetIdRef.current && socket && currentUserId) {
      socket.emit('end-call', {
        targetId: activeCallTargetIdRef.current,
        senderId: currentUserId
      });
    }
    cleanupCall();
  };

  const cleanupCall = useCallback((reason?: string) => {
    console.log('cleanupCall called:', reason || 'unknown');
    // Use refs to prevent race conditions during cleanup
    const pc = peerConnectionRef.current;
    const streamRef = callState.localStream;
    
    if (pc) {
      console.log('Closing peer connection');
      pc.close();
      peerConnectionRef.current = null;
    }
    
    // Clear refs first
    activeCallTargetIdRef.current = null;
    
    // Then update state - use functional update to avoid dependency issues
    setCallState(prev => {
      // Stop tracks if they exist in the state or in our captured ref
      const streamToCleanup = streamRef || prev.localStream;
      if (streamToCleanup) {
        console.log('Stopping tracks');
        streamToCleanup.getTracks().forEach(t => t.stop());
      }
      return {
        isCalling: false,
        isConnected: false,
        incomingCall: null,
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isSpeaker: false,
        activeChatId: null
      };
    });
  }, []); // Empty deps - use refs for values

  const toggleMute = () => {
    setCallState(prev => {
      const newIsMuted = !prev.isMuted;
      if (prev.localStream) {
        prev.localStream.getAudioTracks().forEach(track => {
          track.enabled = !newIsMuted; // If we want to mute, we disable the track
        });
      }
      return { ...prev, isMuted: newIsMuted };
    });
  };

  const toggleSpeaker = () => {
    // Note: react-native-webrtc provides something like `InCallManager` (from react-native-incall-manager) 
    // to route audio to the loudspeaker. Without it, the speaker toggle is decorative or requires native bridging.
    // For V1 MVP, we will assume generic state.
    setCallState(prev => ({ ...prev, isSpeaker: !prev.isSpeaker }));
  };

  const toggleVideo = () => {
    setCallState(prev => {
      const newIsVideoOn = !prev.localStream?.getVideoTracks().some(track => track.enabled);
      if (prev.localStream) {
        prev.localStream.getVideoTracks().forEach(track => {
          track.enabled = newIsVideoOn;
        });
      }
      return prev;
    });
  };

  return (
    <CallContext.Provider value={{
      ...callState,
      initiateCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within CallProvider');
  return context;
};
