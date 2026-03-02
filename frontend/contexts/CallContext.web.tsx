import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// Web-Specific Implementation using Browser Native APIs
import { useSocket } from './SocketContext';

interface CallState {
  isCalling: boolean;
  incomingCall: any | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isSpeaker: boolean;
  activeChatId: string | null;
}

interface CallContextType extends CallState {
  initiateCall: (targetIds: string[], chatId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
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

  const setupMediaAndPC = async (targetId: string): Promise<RTCPeerConnection> => {
    // 1. Get Local Microphone Stream
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      }) as MediaStream;
    } catch (err) {
      console.warn("Could not get microphone on web:", err);
      // Fallback empty stream for testing if denied
      stream = new MediaStream();
    }

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

    // Handle abrupt close
    pc.onconnectionstatechange = (event: any) => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupCall();
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
      setCallState(prev => ({ ...prev, isCalling: true, activeChatId: chatId }));
      
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

  const cleanupCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setCallState(prev => {
      if (prev.localStream) {
        prev.localStream.getTracks().forEach(t => t.stop());
      }
      return {
        isCalling: false,
        incomingCall: null,
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isSpeaker: false,
        activeChatId: null
      };
    });
    
    activeCallTargetIdRef.current = null;
  }, []);

  const toggleMute = () => {
    setCallState(prev => {
      if (prev.localStream) {
        prev.localStream.getAudioTracks().forEach(track => {
          track.enabled = prev.isMuted; // If currently muted, we enable it.
        });
      }
      return { ...prev, isMuted: !prev.isMuted };
    });
  };

  const toggleSpeaker = () => {
    // Note: react-native-webrtc provides something like `InCallManager` (from react-native-incall-manager) 
    // to route audio to the loudspeaker. Without it, the speaker toggle is decorative or requires native bridging.
    // For V1 MVP, we will assume generic state.
    setCallState(prev => ({ ...prev, isSpeaker: !prev.isSpeaker }));
  };

  return (
    <CallContext.Provider value={{
      ...callState,
      initiateCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleSpeaker
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
