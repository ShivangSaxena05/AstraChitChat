import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { useSocket } from './SocketContext';

// Declare globals for TypeScript when on web
declare global {
  interface Window {
    RTCPeerConnection: any;
    RTCSessionDescription: any;
    RTCIceCandidate: any;
  }
}

// Native-only modules loaded via commonjs require to prevent Web bundler crashes
let NativeRTCPeerConnection: any = null;
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;
let NativeMediaDevices: any = null;
let NativeInCallManager: any = null;
let IS_CALLING_FEATURE_ENABLED = false;

if (Platform.OS === 'web') {
  IS_CALLING_FEATURE_ENABLED = true;
} else {
  try {
    const webrtc = require('react-native-webrtc');
    NativeRTCPeerConnection = webrtc.RTCPeerConnection;
    NativeRTCSessionDescription = webrtc.RTCSessionDescription;
    NativeRTCIceCandidate = webrtc.RTCIceCandidate;
    NativeMediaDevices = webrtc.mediaDevices;
    
    const incall = require('react-native-incall-manager');
    NativeInCallManager = incall.default || incall;

    // If all modules load, enable the feature
    if (NativeRTCPeerConnection && NativeInCallManager) {
        IS_CALLING_FEATURE_ENABLED = true;
    } else {
        throw new Error("One or more native calling modules failed to load properly.");
    }
  } catch (e) {
    console.error('FATAL: Native WebRTC modules failed to load. Calling feature will be disabled.', e);
    IS_CALLING_FEATURE_ENABLED = false;
  }
}

interface CallState {
  isCalling: boolean;
  isConnected: boolean; // True only when WebRTC handshake is complete
  incomingCall: any | null;
  targetUser: { username: string; profilePicture: string } | null;
  localStream: any | null; // Using any to represent either Native MediaStream or HTML5 MediaStream
  remoteStream: any | null;
  isMuted: boolean;
  isSpeaker: boolean;
  activeChatId: string | null;
  isVideoEnabled: boolean;
  videoUpgradeRequest: any | null;
  isVideoUpgradePending: boolean;
}

interface CallContextType extends CallState {
  isCallingFeatureEnabled: boolean;
  initiateCall: (targetIds: string[], chatId: string, isVideo?: boolean) => Promise<void>;
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
}

const CallContext = createContext<CallContextType | null>(null);

const configuration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
  ]
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, currentUserId } = useSocket();
  const [callState, setCallState] = useState<CallState>({
    isCalling: false,
    isConnected: false,
    incomingCall: null,
    targetUser: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isSpeaker: false,
    activeChatId: null,
    isVideoEnabled: false,
    videoUpgradeRequest: null,
    isVideoUpgradePending: false,
  });

  const peerConnectionRef = useRef<any | null>(null);
  const activeCallTargetIdRef = useRef<string | null>(null);
  const iceCandidateQueueRef = useRef<any[]>([]);
  const pendingCandidatesRef = useRef<{ [callerId: string]: any[] }>({});

  const processIceQueue = async () => {
    if (!peerConnectionRef.current) return;
    const IceCandidate = Platform.OS === 'web' ? window.RTCIceCandidate : NativeRTCIceCandidate;
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await peerConnectionRef.current.addIceCandidate(new IceCandidate(candidate));
        console.log('[Signaling] Queued ICE Candidate added successfully');
      } catch (error) {
        console.error('[Signaling] Failed to add queued ICE candidate:', error);
      }
    }
  };

  // Request Hardware Permissions Cross-Platform
  const requestPermissions = async (video: boolean): Promise<boolean> => {
    if (Platform.OS === 'web') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video });
        console.log('[WebRTC][Web] Web hardware permissions explicitly granted');
        return true;
      } catch (err) {
        console.warn('[WebRTC][Web] Hardware permission denied:', err);
        return false;
      }
    } else if (Platform.OS === 'android') {
      try {
        const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
        if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);

        const granted = await PermissionsAndroid.requestMultiple(perms);
        const audioGranted = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
        const videoGranted = video ? granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED : true;
        
        console.log(`[WebRTC][Android] Permissions - Audio: ${audioGranted}, Video: ${videoGranted}`);
        return audioGranted && videoGranted;
      } catch (err) {
        console.warn('[WebRTC][Android] Permission fetch error:', err);
        return false;
      }
    }
    // iOS handles it via Info.plist and automatic prompts
    return true;
  };

  // Socket Listeners for Signaling
  useEffect(() => {
    if (!socket || !currentUserId) return;

    socket.on('webrtc-offer', async ({ offer, callerId, chatId, isVideo }) => {
      // ✅ Guard against disabled feature
      if (!IS_CALLING_FEATURE_ENABLED) {
        console.warn('[Signaling] Rejecting call because calling feature is disabled on this device.');
        socket.emit('end-call', { targetId: callerId, senderId: currentUserId });
        return;
      }
      
      // Renegotiation check: If we already have a peer connection and are talking to the same user
      if (peerConnectionRef.current && activeCallTargetIdRef.current === callerId) {
        console.log('[Signaling] Renegotiation offer received (Media Upgrade)');
        try {
          const SessionDesc = Platform.OS === 'web' ? window.RTCSessionDescription : NativeRTCSessionDescription;
          await peerConnectionRef.current.setRemoteDescription(new SessionDesc(offer));
          await processIceQueue(); // Process any queued ICE candidates
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          
          socket.emit('webrtc-answer', {
            targetId: callerId,
            answer,
            responderId: currentUserId
          });

          // Reflect remote video state if this is an upgrade to video
          if (isVideo) {
            setCallState(prev => ({ ...prev, isVideoEnabled: true }));
          }
        } catch (e) {
          console.error('[WebRTC] Renegotiation failed:', e);
        }
        return;
      }

      if (peerConnectionRef.current || callState.isCalling) {
        console.log('[Signaling] Busy, rejecting incoming call with "busy" signal to:', callerId);
        socket.emit('busy', { targetId: callerId, senderId: currentUserId });
        return;
      }
      console.log('[Signaling] Received call offer from:', callerId, '| Video:', isVideo);
      setCallState(prev => ({ ...prev, incomingCall: { offer, callerId, chatId, isVideo } }));
    });

    socket.on('webrtc-answer', async ({ answer, responderId }) => {
      console.log('[Signaling] Received call answer from:', responderId);
      if (peerConnectionRef.current) {
        try {
          const SessionDesc = Platform.OS === 'web' ? window.RTCSessionDescription : NativeRTCSessionDescription;
          await peerConnectionRef.current.setRemoteDescription(new SessionDesc(answer));
          await processIceQueue(); // Process any queued ICE candidates
        } catch (e) {
          console.error('[WebRTC] Failed to set remote description on answer:', e);
        }
      }
    });

    socket.on('webrtc-candidate', async ({ candidate, senderId }) => {
      if (peerConnectionRef.current) {
        try {
          const IceCandidate = Platform.OS === 'web' ? window.RTCIceCandidate : NativeRTCIceCandidate;
          if (peerConnectionRef.current.remoteDescription && peerConnectionRef.current.remoteDescription.type) {
             await peerConnectionRef.current.addIceCandidate(new IceCandidate(candidate));
             console.log('[Signaling] ICE Candidate added successfully');
          } else {
             console.log('[Signaling] Queueing ICE Candidate (remoteDescription not set yet)');
             iceCandidateQueueRef.current.push(candidate);
          }
        } catch (error) {
          console.error('[Signaling] Failed to add ICE candidate', error);
        }
      } else {
        console.log('[Signaling] Caching ICE candidate before call acceptance');
        if (!pendingCandidatesRef.current[senderId]) {
            pendingCandidatesRef.current[senderId] = [];
        }
        pendingCandidatesRef.current[senderId].push(candidate);
      }
    });

    socket.on('end-call', () => {
      console.log('[Signaling] Remote requested to end call');
      cleanupCall('remote ended call');
    });

    socket.on('busy', ({ senderId }) => {
        console.log(`[Signaling] Call target ${senderId} is busy.`);
        cleanupCall('target was busy');
        // Optionally, trigger a user-facing notification: "User is on another call."
    });

    socket.on('request-video-upgrade', ({ callerId }) => {
      console.log('[Signaling] Received video upgrade request from:', callerId);
      setCallState(prev => ({ ...prev, videoUpgradeRequest: { callerId } }));
    });

    socket.on('accept-video-upgrade', async ({ responderId }) => {
      console.log('[Signaling] Video upgrade accepted by:', responderId);
      setCallState(prev => ({ ...prev, isVideoUpgradePending: false }));
      
      if (!peerConnectionRef.current || !activeCallTargetIdRef.current) return;
      try {
        const hasCam = await requestPermissions(true);
        if (!hasCam) return;
        
        let videoStream;
        if (Platform.OS === 'web') {
           videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } else {
           videoStream = await NativeMediaDevices.getUserMedia({ video: true });
        }
        
        const videoTrack = videoStream.getVideoTracks()[0];
        
        setCallState(prev => {
          if (prev.localStream) {
            prev.localStream.addTrack(videoTrack);
            return { ...prev, isVideoEnabled: true, localStream: prev.localStream };
          }
          return prev;
        });
        
        peerConnectionRef.current.addTrack(videoTrack, callState.localStream);
        
        const offer = await peerConnectionRef.current.createOffer(Platform.OS === 'web' ? { offerToReceiveVideo: true } : {});
        await peerConnectionRef.current.setLocalDescription(offer);
        
        socket?.emit('webrtc-offer', {
          targetId: activeCallTargetIdRef.current,
          offer,
          callerId: currentUserId,
          chatId: callState.activeChatId,
          isVideo: true
        });
        console.log('[WebRTC] Sent renegotiation offer for video upgrade');
      } catch (e) {
        console.error('[WebRTC] Video upgrade failed', e);
      }
    });

    socket.on('decline-video-upgrade', ({ responderId }) => {
      console.log('[Signaling] Video upgrade declined by:', responderId);
      setCallState(prev => ({ ...prev, isVideoUpgradePending: false }));
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-candidate');
      socket.off('end-call');
      socket.off('busy');
      socket.off('request-video-upgrade');
      socket.off('accept-video-upgrade');
      socket.off('decline-video-upgrade');
    };
  }, [socket, currentUserId, callState.isCalling]);

  const setupMediaAndPC = async (targetId: string, isVideo: boolean = false): Promise<any> => {
    // 0. Permissions
    const hasPerms = await requestPermissions(isVideo);
    if (!hasPerms) throw new Error('Hardware permissions denied by user');

    // 1. Get Local Steam
    let stream;
    if (Platform.OS === 'web') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    } else {
      stream = await NativeMediaDevices.getUserMedia({ audio: true, video: isVideo });
    }
    
    console.log('[WebRTC] Local media stream obtained', stream.id);
    setCallState(prev => ({ ...prev, localStream: stream, isVideoEnabled: isVideo }));

    // 2. Setup RTCPeerConnection
    const PCConstructor = Platform.OS === 'web' ? window.RTCPeerConnection : NativeRTCPeerConnection;
    const pc = new PCConstructor(configuration);
    
    peerConnectionRef.current = pc;
    activeCallTargetIdRef.current = targetId;

    // Add local tracks to peer connection
    stream.getTracks().forEach((track: any) => {
      pc.addTrack(track, stream);
    });

    // Handle ICE Candidates natively or via web
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
      console.log('[WebRTC] Remote track received:', event.track.kind);
      setCallState(prev => {
        // Platform differences handling
        if (Platform.OS === 'web') {
          // On Web, we can just assign the MediaStream from event.streams[0] directly
          return { ...prev, remoteStream: event.streams[0] };
        } else {
          // On Native react-native-webrtc, sometimes the stream gets accumulated
          let newStream = prev.remoteStream;
          if (!newStream) {
             const RNMediaStream = require('react-native-webrtc').MediaStream;
             newStream = new RNMediaStream();
          }
          newStream.addTrack(event.track);
          return { ...prev, remoteStream: newStream };
        }
      });
    };

    // Connection States
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection State Changed: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setCallState(prev => ({ ...prev, isConnected: true }));
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupCall(`Connection ${pc.connectionState}`);
      } else if (pc.connectionState === 'closed') {
        cleanupCall('Connection closed naturally');
      }
    };

    return pc;
  };

  const initiateCall = async (targetIds: string[], chatId: string, targetUser: any = null, isVideo: boolean = false) => {
    if (!IS_CALLING_FEATURE_ENABLED) {
      Alert.alert('Calling Not Available', 'The calling feature is not available on this device.');
      return console.warn('[WebRTC] Cannot initiate call: calling feature is not available.');
    }
    if (targetIds.length === 0 || !socket || !currentUserId) return;
    const targetId = targetIds[0];

    try {
      if (Platform.OS !== 'web' && NativeInCallManager) {
        NativeInCallManager.start({ media: isVideo ? 'video' : 'audio' });
        NativeInCallManager.setForceSpeakerphoneOn(false);
      }

      setCallState(prev => ({ ...prev, isCalling: true, isConnected: false, activeChatId: chatId, targetUser }));
      
      const pc = await setupMediaAndPC(targetId, isVideo);
      
      const offer = await pc.createOffer(Platform.OS === 'web' ? { offerToReceiveAudio: true, offerToReceiveVideo: isVideo } : {});
      await pc.setLocalDescription(offer);

      console.log('[Signaling] Emitting offer');
      socket.emit('webrtc-offer', {
        targetId,
        offer,
        callerId: currentUserId,
        chatId,
        isVideo
      });
      
    } catch (error) {
      console.error('[WebRTC] Call initiation failed:', error);
      cleanupCall();
    }
  };

  const acceptCall = async (isVideo: boolean = false) => {
    if (!IS_CALLING_FEATURE_ENABLED) {
      Alert.alert('Calling Not Available', 'The calling feature is not available on this device.');
      return console.warn('[WebRTC] Cannot accept call: calling feature is not available.');
    }
    if (!callState.incomingCall || !socket || !currentUserId) return;
    
    // Auto-detect incoming call media type
    const incomingIsVideo = callState.incomingCall.isVideo ?? isVideo;
    const { offer, callerId, chatId } = callState.incomingCall;

    try {
      if (Platform.OS !== 'web' && NativeInCallManager) {
        NativeInCallManager.start({ media: incomingIsVideo ? 'video' : 'audio' });
        NativeInCallManager.setForceSpeakerphoneOn(false);
      }

      setCallState(prev => ({ ...prev, isCalling: true, incomingCall: null, activeChatId: chatId }));
      
      const pc = await setupMediaAndPC(callerId, incomingIsVideo);
      
      const SessionDesc = Platform.OS === 'web' ? window.RTCSessionDescription : NativeRTCSessionDescription;
      await pc.setRemoteDescription(new SessionDesc(callState.incomingCall.offer));
      
      if (pendingCandidatesRef.current[callerId]) {
         console.log(`[Signaling] Restoring ${pendingCandidatesRef.current[callerId].length} cached ICE candidates`);
         iceCandidateQueueRef.current.push(...pendingCandidatesRef.current[callerId]);
         delete pendingCandidatesRef.current[callerId];
      }

      await processIceQueue();
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('[Signaling] Emitting answer');
      socket.emit('webrtc-answer', {
        targetId: callerId,
        answer,
        responderId: currentUserId
      });
    } catch (error) {
      console.error('[WebRTC] Accept call failed:', error);
      cleanupCall();
    }
  };

  const declineCall = () => {
    if (callState.incomingCall && socket && currentUserId) {
      socket.emit('end-call', { targetId: callState.incomingCall.callerId, senderId: currentUserId });
    }
    setCallState(prev => ({ ...prev, incomingCall: null }));
  };

  const endCall = () => {
    if (activeCallTargetIdRef.current && socket && currentUserId) {
      socket.emit('end-call', { targetId: activeCallTargetIdRef.current, senderId: currentUserId });
    }
    cleanupCall('user ended call actively');
  };

  // ✅ CRITICAL REQUIREMENT: Robust Cleanup
  const cleanupCall = useCallback((reason?: string) => {
    console.log(`[WebRTC] Executing cleanup logic | Reason: ${reason || 'unknown'}`);
    
    if (Platform.OS !== 'web' && NativeInCallManager) {
      try {
        NativeInCallManager.stop();
      } catch (e) {
        console.warn('InCallManager stop error:', e);
      }
    }
    
    const pc = peerConnectionRef.current;
    
    if (pc) {
      console.log('[WebRTC] Closing RTCPeerConnection');
      pc.close();
      peerConnectionRef.current = null;
    }
    
    activeCallTargetIdRef.current = null;
    
    setCallState(prev => {
      // ✅ Stop all hardware tracks aggressively to prevent memory leaks/locked devices
      if (prev.localStream) {
        console.log('[WebRTC] Disabling local tracks');
        prev.localStream.getTracks().forEach((t: any) => {
           t.stop();
           t.enabled = false;
        });
      }
      if (prev.remoteStream) {
        prev.remoteStream.getTracks().forEach((t: any) => {
           t.stop();
        });
      }

      return {
        isCalling: false,
        isConnected: false,
        incomingCall: null,
        targetUser: null,
        localStream: null,
        remoteStream: null,
        isMuted: false,
        isSpeaker: false,
        activeChatId: null,
        isVideoEnabled: false,
        videoUpgradeRequest: null,
        isVideoUpgradePending: false
      };
    });
  }, []);

  const toggleMute = () => {
    setCallState(prev => {
      const newMuted = !prev.isMuted;
      console.log(`[WebRTC] Toggling Mic - Now Muted: ${newMuted}`);
      if (prev.localStream) {
        prev.localStream.getAudioTracks().forEach((track: any) => {
          track.enabled = !newMuted;
        });
      }
      return { ...prev, isMuted: newMuted };
    });
  };

  const toggleSpeaker = () => {
    const newSpeaker = !callState.isSpeaker;
    if (Platform.OS !== 'web' && NativeInCallManager) {
      try {
        NativeInCallManager.setForceSpeakerphoneOn(newSpeaker);
      } catch (e) {
        console.warn('InCallManager speaker toggle error:', e);
      }
    }
    setCallState(prev => ({ ...prev, isSpeaker: newSpeaker }));
  };

  const toggleVideo = () => {
    setCallState(prev => {
      if (!prev.localStream) return prev;
      
      const tracks = prev.localStream.getVideoTracks();
      if (!tracks.length) return prev;

      const newIsVideoOn = !tracks[0].enabled;
      tracks.forEach((track: any) => {
        track.enabled = newIsVideoOn;
      });
      return { ...prev, isVideoEnabled: newIsVideoOn };
    });
  };

  const switchCamera = () => {
    if (Platform.OS !== 'web' && callState.localStream) {
      callState.localStream.getVideoTracks().forEach((track: any) => {
        if (typeof track._switchCamera === 'function') {
           track._switchCamera();
        }
      });
    }
  };

  const upgradeToVideo = async () => {
    if (!IS_CALLING_FEATURE_ENABLED) {
        Alert.alert('Calling Not Available', 'The calling feature is not available on this device.');
        return console.warn('[WebRTC] Cannot upgrade to video: calling feature is not available.');
    }
    if (!peerConnectionRef.current || !activeCallTargetIdRef.current) return;
    setCallState(prev => ({ ...prev, isVideoUpgradePending: true }));
    socket?.emit('request-video-upgrade', { 
         targetId: activeCallTargetIdRef.current,
         callerId: currentUserId
    });
    console.log('[WebRTC] Sent request for video upgrade to', activeCallTargetIdRef.current);
  };

  const acceptVideoUpgrade = async () => {
    if (!IS_CALLING_FEATURE_ENABLED) {
        Alert.alert('Calling Not Available', 'The calling feature is not available on this device.');
        return console.warn('[WebRTC] Cannot accept video upgrade: calling feature is not available.');
    }
    const callerId = callState.videoUpgradeRequest?.callerId;
    if (!callerId) return;

    setCallState(prev => ({ ...prev, videoUpgradeRequest: null }));
    
    try {
      const hasCam = await requestPermissions(true);
      if (hasCam) {
        let videoStream;
        if (Platform.OS === 'web') {
           videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } else {
           videoStream = await NativeMediaDevices.getUserMedia({ video: true });
        }
        const videoTrack = videoStream.getVideoTracks()[0];
        
        setCallState(prev => {
          if (prev.localStream) {
            prev.localStream.addTrack(videoTrack);
            return { ...prev, isVideoEnabled: true, localStream: prev.localStream };
          }
          return prev;
        });
        peerConnectionRef.current?.addTrack(videoTrack, callState.localStream);
      }
    } catch (e) {
      console.warn("Failed to get local camera for video upgrade", e);
    }

    socket?.emit('accept-video-upgrade', { 
       targetId: callerId, 
       responderId: currentUserId 
    });
  };

  const declineVideoUpgrade = () => {
    const callerId = callState.videoUpgradeRequest?.callerId;
    if (!callerId) return;

    setCallState(prev => ({ ...prev, videoUpgradeRequest: null }));
    socket?.emit('decline-video-upgrade', { 
       targetId: callerId, 
       responderId: currentUserId 
    });
  };

  return (
    <CallContext.Provider value={{
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
      declineVideoUpgrade
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
