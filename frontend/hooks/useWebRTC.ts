import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Alert } from 'react-native';

// Platform-specific imports
let NativeRTCPeerConnection: any = null;
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;
let NativeMediaDevices: any = null;
let NativeInCallManager: any = null;

if (Platform.OS !== 'web') {
  try {
    const webrtc = require('react-native-webrtc');
    NativeRTCPeerConnection = webrtc.RTCPeerConnection;
    NativeRTCSessionDescription = webrtc.RTCSessionDescription;
    NativeRTCIceCandidate = webrtc.RTCIceCandidate;
    NativeMediaDevices = webrtc.mediaDevices;

    const incall = require('react-native-incall-manager');
    NativeInCallManager = incall.default || incall;
  } catch (e) {
    console.error('[useWebRTC] Failed to load native modules:', e);
  }
}

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

interface WebRTCHookResult {
  localStream: any | null;
  remoteStream: any | null;
  isConnected: boolean;
  peerConnectionRef: React.MutableRefObject<any | null>;
  setupMediaAndPC: (targetId: string, isVideo: boolean) => Promise<any>;
  cleanup: (reason?: string) => void;
  setupConnectionTimeout: () => void;
  clearConnectionTimeout: () => void;
  processIceQueue: () => Promise<void>;
}

/**
 * Hook to manage WebRTC peer connection lifecycle
 * Handles:
 * - Local/remote stream management
 * - Peer connection setup/teardown
 * - Connection timeouts
 * - ICE candidate queueing
 * - Platform-specific cleanup
 */
export const useWebRTC = (
  targetId: string | null,
  socket: any | null,
  currentUserId: string | null,
): WebRTCHookResult => {
  const [localStream, setLocalStream] = useState<any | null>(null);
  const [remoteStream, setRemoteStream] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnectionRef = useRef<any | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceCandidateQueueRef = useRef<any[]>([]);

  /**
   * Request hardware permissions (audio/video) cross-platform
   */
  const requestPermissions = useCallback(async (video: boolean): Promise<boolean> => {
    if (Platform.OS === 'web') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video });
        console.log('[useWebRTC] Web permissions granted');
        return true;
      } catch (err: any) {
        const errorName = err.name || 'PermissionError';
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
          Alert.alert(
            'Permission Denied',
            `Please allow access to your ${video ? 'camera and ' : ''}microphone in browser settings.`,
          );
        } else if (errorName === 'NotFoundError') {
          Alert.alert('Device Not Found', 'No microphone or camera device found.');
        }
        return false;
      }
    } else if (Platform.OS === 'android') {
      try {
        const { PermissionsAndroid } = require('react-native');
        const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
        if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);

        const granted = await PermissionsAndroid.requestMultiple(perms);
        const audioGranted =
          granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
          PermissionsAndroid.RESULTS.GRANTED;
        const videoGranted = video
          ? granted[PermissionsAndroid.PERMISSIONS.CAMERA] ===
            PermissionsAndroid.RESULTS.GRANTED
          : true;

        if (!audioGranted || !videoGranted) {
          const missing = [];
          if (!audioGranted) missing.push('Microphone');
          if (!videoGranted) missing.push('Camera');
          Alert.alert(
            'Permissions Required',
            `${missing.join(' and ')} permission${missing.length > 1 ? 's are' : ' is'} required.`,
          );
        }

        return audioGranted && videoGranted;
      } catch (err) {
        console.warn('[useWebRTC] Android permission error:', err);
        Alert.alert('Permission Error', 'Failed to request permissions.');
        return false;
      }
    }
    // iOS handles via Info.plist
    return true;
  }, []);

  /**
   * Setup connection timeout (30s)
   */
  const setupConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (peerConnectionRef.current && !isConnected) {
        console.error('[useWebRTC] Connection timeout - ICE negotiation failed');
        if (Platform.OS === 'web') {
          alert('Connection Timeout\n\nCould not establish connection. Check your network.');
        } else {
          Alert.alert(
            'Connection Timeout',
            'Could not establish connection. Try switching WiFi/cellular.',
            [
              {
                text: 'Try Again',
                onPress: () => {
                  // Trigger retry in parent component
                },
              },
              { text: 'Cancel', onPress: () => {} },
            ],
          );
        }
      }
    }, 30000);
  }, [isConnected]);

  /**
   * Clear connection timeout
   */
  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Process queued ICE candidates once remote description is set
   */
  const processIceQueue = useCallback(async () => {
    if (!peerConnectionRef.current) return;

    const IceCandidate = Platform.OS === 'web' ? window.RTCIceCandidate : NativeRTCIceCandidate;

    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      try {
        await peerConnectionRef.current.addIceCandidate(new IceCandidate(candidate));
        console.log('[useWebRTC] Queued ICE candidate added');
      } catch (error) {
        console.error('[useWebRTC] Failed to add queued ICE candidate:', error);
      }
    }
  }, []);

  /**
   * Setup media stream and peer connection
   */
  const setupMediaAndPC = useCallback(
    async (targetIdParam: string, isVideo: boolean = false): Promise<any> => {
      try {
        // 1. Request permissions
        const hasPerms = await requestPermissions(isVideo);
        if (!hasPerms) throw new Error('Hardware permissions denied');

        // 2. Get local media stream
        let stream;
        if (Platform.OS === 'web') {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: isVideo,
          });
        } else {
          stream = await NativeMediaDevices.getUserMedia({
            audio: true,
            video: isVideo,
          });
        }

        console.log('[useWebRTC] Local media stream obtained:', stream.id);
        setLocalStream(stream);

        // 3. Create peer connection
        const PCConstructor = Platform.OS === 'web' ? window.RTCPeerConnection : NativeRTCPeerConnection;
        const pc = new PCConstructor(configuration);
        peerConnectionRef.current = pc;

        // 4. Add local tracks
        stream.getTracks().forEach((track: any) => {
          pc.addTrack(track, stream);
        });

        // 5. Handle ICE candidates
        pc.onicecandidate = (event: any) => {
          if (event.candidate && targetIdParam && socket) {
            socket.emit('webrtc-candidate', {
              targetId: targetIdParam,
              candidate: event.candidate,
              senderId: currentUserId,
            });
          }
        };

        // 6. Handle remote stream
        pc.ontrack = (event: any) => {
          console.log('[useWebRTC] Remote track received:', event.track.kind);
          if (Platform.OS === 'web') {
            setRemoteStream(event.streams[0]);
          } else {
            // Native: accumulate tracks
            setRemoteStream((prevStream: any) => {
              let newStream = prevStream;
              if (!newStream) {
                const RNMediaStream = require('react-native-webrtc').MediaStream;
                newStream = new RNMediaStream();
              }
              newStream.addTrack(event.track);
              return newStream;
            });
          }
        };

        // 7. Handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
          console.log('[useWebRTC] ICE connection state:', pc.iceConnectionState);

          switch (pc.iceConnectionState) {
            case 'connected':
            case 'completed':
              console.log('[useWebRTC] ICE connection established');
              clearConnectionTimeout();
              setIsConnected(true);
              break;

            case 'disconnected':
              console.warn('[useWebRTC] ICE disconnected - attempting recovery...');
              if (disconnectTimeoutRef.current) {
                clearTimeout(disconnectTimeoutRef.current);
              }
              disconnectTimeoutRef.current = setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected') {
                  console.error('[useWebRTC] ICE still disconnected after 5s');
                  Alert.alert('Connection Lost', 'Your network connection was interrupted.');
                }
              }, 5000);
              break;

            case 'failed':
              console.error('[useWebRTC] ICE connection failed');
              clearConnectionTimeout();
              Alert.alert('Connection Failed', 'Could not establish peer connection.');
              break;

            case 'closed':
              console.log('[useWebRTC] ICE connection closed');
              clearConnectionTimeout();
              break;

            default:
              break;
          }
        };

        // 8. Handle connection state changes
        pc.onconnectionstatechange = () => {
          console.log('[useWebRTC] WebRTC connection state:', pc.connectionState);

          if (pc.connectionState === 'connected') {
            clearConnectionTimeout();
            setIsConnected(true);
          } else if (pc.connectionState === 'failed') {
            clearConnectionTimeout();
            Alert.alert('Connection Failed', 'Could not establish connection.');
          }
        };

        setupConnectionTimeout();
        return pc;
      } catch (error) {
        console.error('[useWebRTC] Setup failed:', error);
        clearConnectionTimeout();
        throw error;
      }
    },
    [socket, currentUserId, requestPermissions, setupConnectionTimeout, clearConnectionTimeout],
  );

  /**
   * Cleanup peer connection and streams
   */
  const cleanup = useCallback(
    (reason?: string) => {
      console.log(`[useWebRTC] Cleanup | Reason: ${reason || 'unknown'}`);

      clearConnectionTimeout();

      // Stop InCallManager on native
      if (Platform.OS !== 'web' && NativeInCallManager) {
        try {
          NativeInCallManager.stop();
        } catch (e) {
          console.warn('[useWebRTC] InCallManager stop error:', e);
        }
      }

      // Close peer connection
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          pc.getSenders().forEach((sender: any) => {
            if (sender.track) {
              try {
                sender.track.stop();
              } catch (e) {
                console.warn('[useWebRTC] Error stopping sender track:', e);
              }
            }
          });
          pc.close();
        } catch (e) {
          console.warn('[useWebRTC] Error closing peer connection:', e);
        }
        peerConnectionRef.current = null;
      }

      // Stop local streams
      if (localStream) {
        localStream.getTracks().forEach((track: any) => {
          try {
            track.stop();
          } catch (e) {
            console.warn('[useWebRTC] Error stopping local track:', e);
          }
        });
      }

      // Stop remote streams
      if (remoteStream) {
        remoteStream.getTracks().forEach((track: any) => {
          try {
            track.stop();
          } catch (e) {
            console.warn('[useWebRTC] Error stopping remote track:', e);
          }
        });
      }

      // Clear ICE queue
      iceCandidateQueueRef.current = [];

      setLocalStream(null);
      setRemoteStream(null);
      setIsConnected(false);
    },
    [localStream, remoteStream, clearConnectionTimeout],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup('component unmount');
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    isConnected,
    peerConnectionRef,
    setupMediaAndPC,
    cleanup,
    setupConnectionTimeout,
    clearConnectionTimeout,
    processIceQueue,
  };
};
