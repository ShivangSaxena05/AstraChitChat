import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
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

// ✅ PRODUCTION: TURN relay for NAT traversal (add your TURN server)
const configuration = {
  iceServers: [
    // STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN (replace with your TURN server credentials)
    // {
    //   urls: 'turn:your-turn-server.com:3478?transport=udp',
    //   username: process.env.TURN_USERNAME,
    //   credential: process.env.TURN_CREDENTIAL
    // },
    { urls: 'stun:turn.matrix.org:3478?transport=udp' }, // Free public (rate limited)
    { urls: 'turn:numb.viagenie.ca', username: 'webrtc@live.com', credential: 'muazwww' } // Free TURN
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

  // Request microphone permission for Android
  const requestMicrophonePermission = async (): Promise<boolean> => {
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

  // Request camera permission for video calls
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'App needs access to your camera so you can make video calls.',
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

  // Setup Socket Listeners for Signaling
  useEffect(() => {
    if (!socket || !currentUserId) return;

    socket.on('webrtc-offer', async ({ offer, callerId, chatId, isVideo }) => {
      // If we are already in a call, we should automatically decline or ignore (busy)
      if (peerConnectionRef.current || callState.isCalling) {
        socket.emit('end-call', { targetId: callerId, senderId: currentUserId });
        return;
      }
      
      console.log('Received call offer from:', callerId, 'isVideo:', isVideo);
      setCallState(prev => ({ ...prev, incomingCall: { offer, callerId, chatId, isVideo } }));
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
      cleanupCall('remote ended call');
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-candidate');
      socket.off('end-call');
    };
  }, [socket, currentUserId, callState.isCalling]);

  const setupMediaAndPC = async (targetId: string, isVideo: boolean = false): Promise<RTCPeerConnection> => {
    // 0. Request Permissions
    const hasMicPermission = await requestMicrophonePermission();
    if (!hasMicPermission) {
      console.error('Microphone permission denied');
      throw new Error('Microphone permission denied');
    }

    let hasCamPermission = true;
    if (isVideo) {
      hasCamPermission = await requestCameraPermission();
      if (!hasCamPermission) {
        console.error('Camera permission denied for video call');
        // Continue with audio-only if camera permission denied
      }
    }

    // 1. Get Local Microphone/Camera Stream
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: isVideo // Enable video if it's a video call
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
    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate && activeCallTargetIdRef.current) {
        socket?.emit('webrtc-candidate', {
          targetId: activeCallTargetIdRef.current,
          candidate: event.candidate,
          senderId: currentUserId
        });
      }
    };

    // Receive Remote Stream
    (pc as any).ontrack = (event: any) => {
      setCallState(prev => ({ 
        ...prev, 
        remoteStream: event.streams[0]
      }));
    };

    // Handle connection states
    (pc as any).onconnectionstatechange = (event: any) => {
      console.log('WebRTC Connection State:', (pc as any).connectionState);
      if ((pc as any).connectionState === 'connected') {
        setCallState(prev => ({ ...prev, isConnected: true }));
      } else if ((pc as any).connectionState === 'disconnected' || (pc as any).connectionState === 'failed') {
        cleanupCall('connection failed');
      } else if ((pc as any).connectionState === 'closed') {
        cleanupCall('connection closed');
      }
    };

    return pc;
  };

  const initiateCall = async (targetIds: string[], chatId: string, isVideo: boolean = false) => {
    // Note: This basic setup assumes 1-on-1 direct calls currently. 
    // Group calls (Mesh) would require managing multiple RTCPeerConnections (an array/map of them).
    // We will start by connecting to the first target.
    if (targetIds.length === 0 || !socket || !currentUserId) return;
    
    const targetId = targetIds[0];

    try {
      // Start InCallManager for audio routing
      InCallManager.start({ media: isVideo ? 'video' : 'audio' });
      InCallManager.setForceSpeakerphoneOn(false); // Start with earpiece

      setCallState(prev => ({ ...prev, isCalling: true, isConnected: false, activeChatId: chatId }));
      
      const pc = await setupMediaAndPC(targetId, isVideo);
      
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', {
        targetId,
        offer,
        callerId: currentUserId,
        chatId,
        isVideo // Pass isVideo to the offer
      });
      
    } catch (error) {
      console.error('Call initiation failed:', error);
      cleanupCall();
    }
  };

  const acceptCall = async (isVideo: boolean = false) => {
    if (!callState.incomingCall || !socket || !currentUserId) return;
    
    // Get isVideo from incoming call or use parameter
    const incomingIsVideo = callState.incomingCall.isVideo ?? isVideo;
    const { offer, callerId, chatId } = callState.incomingCall;

    try {
      // Start InCallManager for audio/video routing
      InCallManager.start({ media: incomingIsVideo ? 'video' : 'audio' });
      InCallManager.setForceSpeakerphoneOn(false); // Start with earpiece

      setCallState(prev => ({ ...prev, isCalling: true, incomingCall: null, activeChatId: chatId }));
      
      const pc = await setupMediaAndPC(callerId, incomingIsVideo);
      
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
    cleanupCall('user ended call');
  };

  const cleanupCall = useCallback((reason?: string) => {
    console.log('cleanupCall called:', reason || 'unknown');
    
    // Stop InCallManager audio routing
    try {
      InCallManager.stop();
    } catch (e) {
      console.log('InCallManager stop error:', e);
    }
    
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
    // Use InCallManager to actually toggle speaker
    const newSpeakerState = !callState.isSpeaker;
    try {
      InCallManager.setForceSpeakerphoneOn(newSpeakerState);
    } catch (e) {
      console.log('InCallManager speaker toggle error:', e);
    }
    setCallState(prev => ({ ...prev, isSpeaker: newSpeakerState }));
  };

  const toggleVideo = () => {
    setCallState(prev => {
      const newIsVideoOn = !prev.localStream?.getVideoTracks().some(track => track.enabled);
      if (prev.localStream) {
        prev.localStream.getVideoTracks().forEach(track => {
          track.enabled = newIsVideoOn;
        });
      }
      return { ...prev };
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

