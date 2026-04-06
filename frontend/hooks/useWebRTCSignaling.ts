import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';

// Platform-specific imports
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;

if (Platform.OS !== 'web') {
  try {
    const webrtc = require('react-native-webrtc');
    NativeRTCSessionDescription = webrtc.RTCSessionDescription;
    NativeRTCIceCandidate = webrtc.RTCIceCandidate;
  } catch (e) {
    console.error('[useWebRTCSignaling] Failed to load native modules:', e);
  }
}

interface IncomingCall {
  offer: any;
  callerId: string;
  chatId: string;
  isVideo: boolean;
}

interface VideoUpgradeRequest {
  callerId: string;
}

interface SignalingHookResult {
  incomingCall: IncomingCall | null;
  setIncomingCall: (call: IncomingCall | null) => void;
  videoUpgradeRequest: VideoUpgradeRequest | null;
  setVideoUpgradeRequest: (request: VideoUpgradeRequest | null) => void;
  clearIncomingCallTimeout: () => void;
}

/**
 * Hook to manage WebRTC signaling events
 * Handles:
 * - Incoming call offers
 * - Call answers
 * - ICE candidates
 * - Video upgrade requests
 * - Call end signals
 * - Incoming call auto-reject timeout
 */
export const useWebRTCSignaling = (
  socket: any | null,
  currentUserId: string | null,
  peerConnectionRef: React.MutableRefObject<any | null>,
  activeCallTargetIdRef: React.MutableRefObject<string | null>,
  iceCandidateQueueRef: React.MutableRefObject<any[]>,
  pendingCandidatesRef: React.MutableRefObject<{ [callerId: string]: any[] }>,
  onRemoteOffer?: (offer: any, callerId: string) => Promise<void>,
  onRemoteAnswer?: (answer: any, responderId: string) => Promise<void>,
  onRemoteCandidate?: (candidate: any, senderId: string) => Promise<void>,
  onCallEnded?: (reason: string) => void,
  onBusy?: (senderId: string) => void,
): SignalingHookResult => {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [videoUpgradeRequest, setVideoUpgradeRequest] = useState<VideoUpgradeRequest | null>(null);

  const incomingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Clear incoming call auto-reject timeout
   */
  const clearIncomingCallTimeout = useCallback(() => {
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
  }, []);

  /**
   * Setup socket signaling listeners
   */
  useEffect(() => {
    if (!socket || !currentUserId) return;

    /**
     * Handle incoming webrtc-offer
     * Can be a new call or a renegotiation (video upgrade)
     */
    socket.on('webrtc-offer', async ({ offer, callerId, chatId, isVideo }: any) => {
      console.log('[Signaling] Received offer from:', callerId, '| Video:', isVideo);

      // Renegotiation check: already connected to same user
      if (peerConnectionRef.current && activeCallTargetIdRef.current === callerId) {
        console.log('[Signaling] Renegotiation offer received (video upgrade)');
        if (onRemoteOffer) {
          try {
            await onRemoteOffer(offer, callerId);
          } catch (e) {
            console.error('[Signaling] Renegotiation failed:', e);
          }
        }
        return;
      }

      // Reject if already in a call
      if (peerConnectionRef.current || incomingCall) {
        console.log('[Signaling] Busy, rejecting call');
        socket.emit('busy', { targetId: callerId, senderId: currentUserId });
        return;
      }

      // Accept incoming call
      setIncomingCall({ offer, callerId, chatId, isVideo });

      // Auto-reject after 45s
      clearIncomingCallTimeout();
      incomingCallTimeoutRef.current = setTimeout(() => {
        console.warn('[Signaling] Incoming call timeout - auto-rejecting from:', callerId);
        socket.emit('end-call', {
          targetId: callerId,
          senderId: currentUserId,
        });
        setIncomingCall(null);
        if (Platform.OS !== 'web') {
          Alert.alert('Missed Call', 'Call ended due to no response.');
        }
      }, 45000);
    });

    /**
     * Handle webrtc-answer from callee
     */
    socket.on('webrtc-answer', async ({ answer, responderId }: any) => {
      console.log('[Signaling] Received answer from:', responderId);
      if (onRemoteAnswer) {
        try {
          await onRemoteAnswer(answer, responderId);
        } catch (e) {
          console.error('[Signaling] Failed to handle answer:', e);
        }
      }
    });

    /**
     * Handle ICE candidates
     */
    socket.on('webrtc-candidate', async ({ candidate, senderId }: any) => {
      if (peerConnectionRef.current) {
        try {
          const IceCandidate = Platform.OS === 'web' ? window.RTCIceCandidate : NativeRTCIceCandidate;

          // Check if remote description is set
          if (peerConnectionRef.current.remoteDescription && peerConnectionRef.current.remoteDescription.type) {
            await peerConnectionRef.current.addIceCandidate(new IceCandidate(candidate));
            console.log('[Signaling] ICE candidate added');
          } else {
            // Queue for later processing
            console.log('[Signaling] Queueing ICE candidate (remoteDescription not set)');
            iceCandidateQueueRef.current.push(candidate);
          }
        } catch (error) {
          console.error('[Signaling] Failed to add ICE candidate:', error);
        }
      } else {
        // Cache candidates before call acceptance
        console.log('[Signaling] Caching ICE candidate before call acceptance');
        if (!pendingCandidatesRef.current[senderId]) {
          pendingCandidatesRef.current[senderId] = [];
        }
        pendingCandidatesRef.current[senderId].push(candidate);
      }

      if (onRemoteCandidate) {
        try {
          await onRemoteCandidate(candidate, senderId);
        } catch (e) {
          console.error('[Signaling] Error in onRemoteCandidate:', e);
        }
      }
    });

    /**
     * Handle call end signal from remote
     */
    socket.on('end-call', () => {
      console.log('[Signaling] Remote ended call');
      clearIncomingCallTimeout();
      if (onCallEnded) {
        onCallEnded('remote ended call');
      }
    });

    /**
     * Handle busy signal (target already in a call)
     */
    socket.on('busy', ({ senderId }: any) => {
      console.log('[Signaling] Call target is busy:', senderId);
      clearIncomingCallTimeout();
      if (onBusy) {
        onBusy(senderId);
      }
    });

    /**
     * Handle video upgrade request from remote
     */
    socket.on('request-video-upgrade', ({ callerId }: any) => {
      console.log('[Signaling] Video upgrade request from:', callerId);
      setVideoUpgradeRequest({ callerId });
    });

    /**
     * Handle video upgrade acceptance
     */
    socket.on('accept-video-upgrade', ({ responderId }: any) => {
      console.log('[Signaling] Video upgrade accepted by:', responderId);
      // Let parent component handle state update
    });

    /**
     * Handle video upgrade decline
     */
    socket.on('decline-video-upgrade', ({ responderId }: any) => {
      console.log('[Signaling] Video upgrade declined by:', responderId);
      setVideoUpgradeRequest(null);
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
  }, [socket, currentUserId, incomingCall, onRemoteOffer, onRemoteAnswer, onRemoteCandidate, onCallEnded, onBusy, clearIncomingCallTimeout]);

  return {
    incomingCall,
    setIncomingCall,
    videoUpgradeRequest,
    setVideoUpgradeRequest,
    clearIncomingCallTimeout,
  };
};
